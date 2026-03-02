package source

import (
	"io/fs"
	"os"
	"path/filepath"
)

// FileSystemSource implements Source by reading from the local filesystem.
// All paths are resolved relative to the configured root directory.
type FileSystemSource struct {
	root string
}

// NewFileSystemSource creates a Source that reads from the local filesystem
// rooted at the given directory. The root is converted to an absolute path.
func NewFileSystemSource(root string) (*FileSystemSource, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	return &FileSystemSource{root: abs}, nil
}

// resolve joins the relative path with the root and cleans it.
func (s *FileSystemSource) resolve(path string) string {
	return filepath.Join(s.root, filepath.FromSlash(path))
}

// ReadFile returns the contents of the named file.
func (s *FileSystemSource) ReadFile(path string) ([]byte, error) {
	return os.ReadFile(s.resolve(path))
}

// ReadDir returns directory entries sorted by name.
func (s *FileSystemSource) ReadDir(path string) ([]fs.DirEntry, error) {
	return os.ReadDir(s.resolve(path))
}

// Stat returns file info for the named path.
func (s *FileSystemSource) Stat(path string) (fs.FileInfo, error) {
	return os.Stat(s.resolve(path))
}

// Walk walks the file tree rooted at root, calling fn for each entry.
// Paths passed to fn are relative to the source root using forward slashes.
func (s *FileSystemSource) Walk(root string, fn fs.WalkDirFunc) error {
	absRoot := s.resolve(root)
	return filepath.WalkDir(absRoot, func(absPath string, d fs.DirEntry, err error) error {
		// Convert absolute path back to a forward-slash relative path.
		rel, relErr := filepath.Rel(s.root, absPath)
		if relErr != nil {
			rel = absPath
		}
		rel = filepath.ToSlash(rel)
		return fn(rel, d, err)
	})
}

// Root returns the absolute filesystem root path.
func (s *FileSystemSource) Root() string {
	return s.root
}
