package skill

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// CopyDestination specifies where to copy a skill.
type CopyDestination string

const (
	DestGlobal   CopyDestination = "global"
	DestInstance CopyDestination = "instance"
	DestPath     CopyDestination = "path"
)

// CopyOptions configures the copy operation.
type CopyOptions struct {
	Name            string
	Destination     CopyDestination
	DestinationPath string // Used when Destination is DestPath
	InstancePath    string // Used when Destination is DestInstance
	NewName         string // Renames during copy (optional)
	Force           bool   // Overwrites existing
}

// CopyResult contains the result of a copy operation.
type CopyResult struct {
	SourcePath      string   `json:"source_path"`
	DestinationPath string   `json:"destination_path"`
	FilesCopied     []string `json:"files_copied"`
	NewName         string   `json:"new_name,omitempty"`
}

// Copy copies a skill to another location.
func (l *Loader) Copy(opts CopyOptions) (*CopyResult, error) {
	skill, err := l.GetSkill(opts.Name)
	if err != nil {
		return nil, err
	}

	// Legacy wizard files can't be copied as skill bundles
	if skill.LegacyFormat && !skill.HasManifest {
		return nil, fmt.Errorf("skill '%s' is a legacy wizard file and cannot be copied as a skill bundle", opts.Name)
	}

	destDir, err := resolveCopyDestination(opts)
	if err != nil {
		return nil, err
	}

	finalName := opts.Name
	if opts.NewName != "" {
		finalName = opts.NewName
	}

	destPath := filepath.Join(destDir, finalName)

	if _, err := os.Stat(destPath); err == nil {
		if !opts.Force {
			return nil, fmt.Errorf("skill '%s' already exists at %s (use --force to overwrite)", finalName, destPath)
		}
		if err := os.RemoveAll(destPath); err != nil {
			return nil, fmt.Errorf("failed to remove existing skill: %w", err)
		}
	}

	if err := os.MkdirAll(destPath, 0755); err != nil {
		return nil, fmt.Errorf("failed to create destination directory: %w", err)
	}

	filesCopied, err := copyDirFiles(skill.Path, destPath)
	if err != nil {
		os.RemoveAll(destPath)
		return nil, fmt.Errorf("failed to copy skill files: %w", err)
	}

	if opts.NewName != "" {
		_ = updateManifestName(destPath, opts.NewName)
	}

	return &CopyResult{
		SourcePath:      skill.Path,
		DestinationPath: destPath,
		FilesCopied:     filesCopied,
		NewName:         finalName,
	}, nil
}

// resolveCopyDestination determines the destination directory.
func resolveCopyDestination(opts CopyOptions) (string, error) {
	switch opts.Destination {
	case DestGlobal:
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("could not determine home directory: %w", err)
		}
		// Use generators/ for backward compatibility with existing global dirs
		return filepath.Join(home, ".epf-cli", "generators"), nil
	case DestInstance:
		if opts.InstancePath == "" {
			return "", fmt.Errorf("instance path required for instance destination")
		}
		// Use generators/ for backward compatibility
		return filepath.Join(opts.InstancePath, "generators"), nil
	case DestPath:
		if opts.DestinationPath == "" {
			return "", fmt.Errorf("destination path required")
		}
		return opts.DestinationPath, nil
	default:
		return "", fmt.Errorf("unknown destination type: %s", opts.Destination)
	}
}

// ExportOptions configures the export operation.
type ExportOptions struct {
	Name          string
	OutputPath    string
	IncludeReadme bool
}

// ExportResult contains the result of an export operation.
type ExportResult struct {
	ArchivePath   string   `json:"archive_path"`
	SkillDir      string   `json:"skill_dir"`
	FilesExported []string `json:"files_exported"`
	SizeBytes     int64    `json:"size_bytes"`
}

// Export exports a skill as a .tar.gz archive.
func (l *Loader) Export(opts ExportOptions) (*ExportResult, error) {
	skill, err := l.GetSkill(opts.Name)
	if err != nil {
		return nil, err
	}

	if skill.LegacyFormat && !skill.HasManifest {
		return nil, fmt.Errorf("skill '%s' is a legacy wizard file and cannot be exported", opts.Name)
	}

	outputPath := opts.OutputPath
	if outputPath == "" {
		outputPath = fmt.Sprintf("%s.tar.gz", opts.Name)
	}
	if !strings.HasSuffix(outputPath, ".tar.gz") && !strings.HasSuffix(outputPath, ".tgz") {
		outputPath = outputPath + ".tar.gz"
	}

	outFile, err := os.Create(outputPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create output file: %w", err)
	}
	defer outFile.Close()

	gzWriter := gzip.NewWriter(outFile)
	defer gzWriter.Close()

	tarWriter := tar.NewWriter(gzWriter)
	defer tarWriter.Close()

	var filesExported []string

	err = filepath.Walk(skill.Path, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		if !opts.IncludeReadme && info.Name() == DefaultReadmeFile {
			return nil
		}

		relPath, err := filepath.Rel(skill.Path, path)
		if err != nil {
			return err
		}

		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		header.Name = filepath.Join(opts.Name, relPath)

		if err := tarWriter.WriteHeader(header); err != nil {
			return err
		}

		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()

		_, err = io.Copy(tarWriter, file)
		if err != nil {
			return err
		}

		filesExported = append(filesExported, relPath)
		return nil
	})

	if err != nil {
		os.Remove(outputPath)
		return nil, fmt.Errorf("failed to create archive: %w", err)
	}

	fileInfo, _ := os.Stat(outputPath)
	var size int64
	if fileInfo != nil {
		size = fileInfo.Size()
	}

	return &ExportResult{
		ArchivePath:   outputPath,
		SkillDir:      skill.Path,
		FilesExported: filesExported,
		SizeBytes:     size,
	}, nil
}

// InstallSource specifies where to install a skill from.
type InstallSource string

const (
	InstallFromFile      InstallSource = "file"
	InstallFromURL       InstallSource = "url"
	InstallFromDirectory InstallSource = "directory"
)

// InstallOptions configures the install operation.
type InstallOptions struct {
	Source          InstallSource
	SourcePath      string
	Destination     CopyDestination
	DestinationPath string
	InstancePath    string
	NewName         string
	Force           bool
}

// InstallResult contains the result of an install operation.
type InstallResult struct {
	SkillName       string   `json:"skill_name"`
	SourcePath      string   `json:"source_path"`
	DestinationPath string   `json:"destination_path"`
	FilesInstalled  []string `json:"files_installed"`
}

// Install installs a skill from an archive, URL, or directory.
func Install(opts InstallOptions) (*InstallResult, error) {
	switch opts.Source {
	case InstallFromFile:
		return installFromArchive(opts)
	case InstallFromURL:
		return installFromURL(opts)
	case InstallFromDirectory:
		return installFromDir(opts)
	default:
		return nil, fmt.Errorf("unknown source type: %s", opts.Source)
	}
}

// installFromArchive installs from a .tar.gz file.
func installFromArchive(opts InstallOptions) (*InstallResult, error) {
	file, err := os.Open(opts.SourcePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open archive: %w", err)
	}
	defer file.Close()

	tempDir, err := os.MkdirTemp("", "epf-skill-*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer os.RemoveAll(tempDir)

	gzReader, err := gzip.NewReader(file)
	if err != nil {
		return nil, fmt.Errorf("failed to open gzip reader: %w", err)
	}
	defer gzReader.Close()

	tarReader := tar.NewReader(gzReader)

	var skillName string
	var filesExtracted []string

	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("failed to read tar: %w", err)
		}

		parts := strings.Split(header.Name, string(filepath.Separator))
		if len(parts) > 0 && skillName == "" {
			skillName = parts[0]
		}

		destPath := filepath.Join(tempDir, header.Name)

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(destPath, 0755); err != nil {
				return nil, err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
				return nil, err
			}
			outFile, err := os.Create(destPath)
			if err != nil {
				return nil, err
			}
			if _, err := io.Copy(outFile, tarReader); err != nil {
				outFile.Close()
				return nil, err
			}
			outFile.Close()

			if len(parts) > 1 {
				filesExtracted = append(filesExtracted, filepath.Join(parts[1:]...))
			}
		}
	}

	if skillName == "" {
		return nil, fmt.Errorf("could not determine skill name from archive")
	}

	finalName := skillName
	if opts.NewName != "" {
		finalName = opts.NewName
	}

	destDir, err := resolveInstallDestination(opts)
	if err != nil {
		return nil, err
	}

	finalPath := filepath.Join(destDir, finalName)

	if _, err := os.Stat(finalPath); err == nil {
		if !opts.Force {
			return nil, fmt.Errorf("skill '%s' already exists at %s (use --force to overwrite)", finalName, finalPath)
		}
		os.RemoveAll(finalPath)
	}

	if err := os.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create destination directory: %w", err)
	}

	extractedPath := filepath.Join(tempDir, skillName)
	if err := os.Rename(extractedPath, finalPath); err != nil {
		if _, err := copyDirFiles(extractedPath, finalPath); err != nil {
			return nil, fmt.Errorf("failed to install skill: %w", err)
		}
	}

	if opts.NewName != "" && opts.NewName != skillName {
		_ = updateManifestName(finalPath, opts.NewName)
	}

	return &InstallResult{
		SkillName:       finalName,
		SourcePath:      opts.SourcePath,
		DestinationPath: finalPath,
		FilesInstalled:  filesExtracted,
	}, nil
}

// installFromURL downloads and installs from a URL.
func installFromURL(opts InstallOptions) (*InstallResult, error) {
	tempFile, err := os.CreateTemp("", "epf-skill-*.tar.gz")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp file: %w", err)
	}
	defer os.Remove(tempFile.Name())
	defer tempFile.Close()

	resp, err := http.Get(opts.SourcePath) //nolint:gosec
	if err != nil {
		return nil, fmt.Errorf("failed to download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download failed with status: %s", resp.Status)
	}

	if _, err := io.Copy(tempFile, resp.Body); err != nil {
		return nil, fmt.Errorf("failed to save download: %w", err)
	}
	tempFile.Close()

	originalPath := opts.SourcePath
	opts.Source = InstallFromFile
	opts.SourcePath = tempFile.Name()

	result, err := installFromArchive(opts)
	if err != nil {
		return nil, err
	}

	result.SourcePath = originalPath
	return result, nil
}

// installFromDir installs from a local directory.
func installFromDir(opts InstallOptions) (*InstallResult, error) {
	if !looksLikeSkill(opts.SourcePath) {
		return nil, fmt.Errorf("source directory does not appear to be a valid skill (no skill.yaml, generator.yaml, schema.json, or prompt.md found)")
	}

	skillName := filepath.Base(opts.SourcePath)
	if opts.NewName != "" {
		skillName = opts.NewName
	}

	destDir, err := resolveInstallDestination(opts)
	if err != nil {
		return nil, err
	}

	finalPath := filepath.Join(destDir, skillName)

	if _, err := os.Stat(finalPath); err == nil {
		if !opts.Force {
			return nil, fmt.Errorf("skill '%s' already exists at %s (use --force to overwrite)", skillName, finalPath)
		}
		os.RemoveAll(finalPath)
	}

	if err := os.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create destination directory: %w", err)
	}

	filesInstalled, err := copyDirFiles(opts.SourcePath, finalPath)
	if err != nil {
		os.RemoveAll(finalPath)
		return nil, fmt.Errorf("failed to copy skill: %w", err)
	}

	if opts.NewName != "" && opts.NewName != filepath.Base(opts.SourcePath) {
		_ = updateManifestName(finalPath, opts.NewName)
	}

	return &InstallResult{
		SkillName:       skillName,
		SourcePath:      opts.SourcePath,
		DestinationPath: finalPath,
		FilesInstalled:  filesInstalled,
	}, nil
}

// resolveInstallDestination determines the destination directory.
func resolveInstallDestination(opts InstallOptions) (string, error) {
	switch opts.Destination {
	case DestGlobal:
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("could not determine home directory: %w", err)
		}
		return filepath.Join(home, ".epf-cli", "generators"), nil
	case DestInstance:
		if opts.InstancePath == "" {
			return "", fmt.Errorf("instance path required for instance destination")
		}
		return filepath.Join(opts.InstancePath, "generators"), nil
	case DestPath:
		if opts.DestinationPath == "" {
			return "", fmt.Errorf("destination path required")
		}
		return opts.DestinationPath, nil
	default:
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("could not determine home directory: %w", err)
		}
		return filepath.Join(home, ".epf-cli", "generators"), nil
	}
}

// --- File operation helpers ---

// copyDirFiles copies all files from source to destination directory.
func copyDirFiles(srcDir, destDir string) ([]string, error) {
	var filesCopied []string

	err := filepath.Walk(srcDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		relPath, err := filepath.Rel(srcDir, path)
		if err != nil {
			return err
		}

		destPath := filepath.Join(destDir, relPath)

		if info.IsDir() {
			return os.MkdirAll(destPath, info.Mode())
		}

		if err := copyFile(path, destPath); err != nil {
			return err
		}

		filesCopied = append(filesCopied, relPath)
		return nil
	})

	return filesCopied, err
}

// copyFile copies a single file.
func copyFile(src, dest string) error {
	srcFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	srcInfo, err := srcFile.Stat()
	if err != nil {
		return err
	}

	destFile, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, srcInfo.Mode())
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, srcFile)
	return err
}

// updateManifestName updates the name field in the manifest file.
// Tries skill.yaml first, then generator.yaml.
func updateManifestName(skillDir, newName string) error {
	for _, manifestFile := range []string{DefaultManifestFile, LegacyManifestFile} {
		manifestPath := filepath.Join(skillDir, manifestFile)
		data, err := os.ReadFile(manifestPath)
		if err != nil {
			continue
		}

		lines := strings.Split(string(data), "\n")
		for i, line := range lines {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "name:") {
				lines[i] = fmt.Sprintf("name: %s", newName)
				break
			}
		}

		return os.WriteFile(manifestPath, []byte(strings.Join(lines, "\n")), 0644)
	}

	return fmt.Errorf("no manifest file found in %s", skillDir)
}
