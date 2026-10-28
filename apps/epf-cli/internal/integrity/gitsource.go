package integrity

import (
	"archive/tar"
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

var releaseSubject = regexp.MustCompile(`^Release: Bump version to (\S+)`)

// canonicalRoots are the directories of a canonical EPF checkout that hold
// shipped content.
var canonicalRoots = []string{"templates", "definitions"}

// UnreleasedSuffix marks the pseudo-release for content in the working tree that
// is not part of the latest release commit.
const UnreleasedSuffix = "+unreleased"

// GitSource reads canonical content from the release commits of a git checkout.
type GitSource struct {
	dir     string
	commits map[string]string
	order   []string
}

// NewGitSource opens a canonical EPF git checkout.
func NewGitSource(dir string) (*GitSource, error) {
	s := &GitSource{dir: dir, commits: map[string]string{}}
	out, err := s.git("log", "--reverse", "--format=%H%x09%s")
	if err != nil {
		return nil, fmt.Errorf("read git history of %s: %w", dir, err)
	}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		hash, subject, ok := strings.Cut(line, "\t")
		if !ok {
			continue
		}
		m := releaseSubject.FindStringSubmatch(subject)
		if m == nil {
			continue
		}
		if _, seen := s.commits[m[1]]; !seen {
			s.order = append(s.order, m[1])
		}
		s.commits[m[1]] = hash
	}
	return s, nil
}

func (s *GitSource) git(args ...string) ([]byte, error) {
	cmd := exec.Command("git", append([]string{"-C", s.dir}, args...)...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(stderr.String()))
	}
	return out, nil
}

// Releases returns the released versions, oldest first. When the working tree
// differs from the latest release in the canonical directories, a final
// "<version>+unreleased" entry is appended so instances created from a
// checkout ahead of the last release still match.
func (s *GitSource) Releases() ([]string, error) {
	rel := append([]string(nil), s.order...)
	if len(rel) == 0 {
		return rel, nil
	}
	last := rel[len(rel)-1]
	dirty, err := s.workingTreeDiffers(s.commits[last])
	if err != nil {
		return nil, err
	}
	if dirty {
		rel = append(rel, last+UnreleasedSuffix)
	}
	return rel, nil
}

func (s *GitSource) workingTreeDiffers(commit string) (bool, error) {
	args := append([]string{"diff", "--name-only", commit, "--"}, canonicalRoots...)
	out, err := s.git(args...)
	if err != nil {
		return false, err
	}
	if len(bytes.TrimSpace(out)) > 0 {
		return true, nil
	}
	args = append([]string{"status", "--porcelain", "--"}, canonicalRoots...)
	out, err = s.git(args...)
	if err != nil {
		return false, err
	}
	return len(bytes.TrimSpace(out)) > 0, nil
}

// Files returns the YAML files under the canonical directories at a release.
func (s *GitSource) Files(release string) (map[string][]byte, error) {
	if strings.HasSuffix(release, UnreleasedSuffix) {
		return s.workingTreeFiles()
	}
	commit, ok := s.commits[release]
	if !ok {
		return nil, fmt.Errorf("unknown release %q", release)
	}
	archive, err := s.git("archive", commit)
	if err != nil {
		return nil, err
	}
	files := map[string][]byte{}
	tr := tar.NewReader(bytes.NewReader(archive))
	for {
		hdr, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read archive of %s: %w", release, err)
		}
		if hdr.Typeflag != tar.TypeReg || !inCanonicalRoot(hdr.Name) {
			continue
		}
		body, err := io.ReadAll(tr)
		if err != nil {
			return nil, fmt.Errorf("read %s@%s: %w", hdr.Name, release, err)
		}
		files[hdr.Name] = body
	}
	return files, nil
}

func (s *GitSource) workingTreeFiles() (map[string][]byte, error) {
	files := map[string][]byte{}
	for _, root := range canonicalRoots {
		base := filepath.Join(s.dir, root)
		err := filepath.WalkDir(base, func(p string, d os.DirEntry, err error) error {
			if err != nil {
				if os.IsNotExist(err) {
					return nil
				}
				return err
			}
			if d.IsDir() {
				return nil
			}
			body, err := os.ReadFile(p)
			if err != nil {
				return fmt.Errorf("read %s: %w", p, err)
			}
			rel, err := filepath.Rel(s.dir, p)
			if err != nil {
				return fmt.Errorf("relative path of %s: %w", p, err)
			}
			files[filepath.ToSlash(rel)] = body
			return nil
		})
		if err != nil {
			return nil, fmt.Errorf("walk %s: %w", base, err)
		}
	}
	return files, nil
}

func inCanonicalRoot(name string) bool {
	for _, r := range canonicalRoots {
		if strings.HasPrefix(name, r+"/") {
			return true
		}
	}
	return false
}
