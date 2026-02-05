package generator

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

// CopyDestination specifies where to copy a generator
type CopyDestination string

const (
	// DestGlobal copies to ~/.epf-cli/generators/
	DestGlobal CopyDestination = "global"
	// DestInstance copies to {instance}/generators/
	DestInstance CopyDestination = "instance"
	// DestPath copies to a specific path
	DestPath CopyDestination = "path"
)

// CopyOptions configures the copy operation
type CopyOptions struct {
	// Source generator name
	Name string

	// Destination type
	Destination CopyDestination

	// DestinationPath is used when Destination is DestPath
	DestinationPath string

	// InstancePath is the target instance (when Destination is DestInstance)
	InstancePath string

	// NewName renames the generator during copy (optional)
	NewName string

	// Force overwrites existing generator
	Force bool
}

// CopyResult contains the result of a copy operation
type CopyResult struct {
	SourcePath      string   `json:"source_path"`
	DestinationPath string   `json:"destination_path"`
	FilesCopied     []string `json:"files_copied"`
	NewName         string   `json:"new_name,omitempty"`
}

// Copy copies a generator to another location
func (l *Loader) Copy(opts CopyOptions) (*CopyResult, error) {
	// Get source generator
	gen, err := l.GetGenerator(opts.Name)
	if err != nil {
		return nil, err
	}

	// Determine destination path
	destDir, err := l.resolveCopyDestination(opts)
	if err != nil {
		return nil, err
	}

	// Determine final generator name
	finalName := opts.Name
	if opts.NewName != "" {
		finalName = opts.NewName
	}

	destPath := filepath.Join(destDir, finalName)

	// Check if destination exists
	if _, err := os.Stat(destPath); err == nil {
		if !opts.Force {
			return nil, fmt.Errorf("generator '%s' already exists at %s (use --force to overwrite)", finalName, destPath)
		}
		// Remove existing
		if err := os.RemoveAll(destPath); err != nil {
			return nil, fmt.Errorf("failed to remove existing generator: %w", err)
		}
	}

	// Create destination directory
	if err := os.MkdirAll(destPath, 0755); err != nil {
		return nil, fmt.Errorf("failed to create destination directory: %w", err)
	}

	// Copy files
	filesCopied, err := copyGeneratorFiles(gen.Path, destPath)
	if err != nil {
		// Clean up on failure
		os.RemoveAll(destPath)
		return nil, fmt.Errorf("failed to copy generator files: %w", err)
	}

	// Update manifest if renamed
	if opts.NewName != "" {
		if err := updateManifestName(destPath, opts.NewName); err != nil {
			// Non-fatal, just warn
			fmt.Fprintf(os.Stderr, "Warning: could not update generator name in manifest: %v\n", err)
		}
	}

	return &CopyResult{
		SourcePath:      gen.Path,
		DestinationPath: destPath,
		FilesCopied:     filesCopied,
		NewName:         finalName,
	}, nil
}

// resolveCopyDestination determines the destination directory
func (l *Loader) resolveCopyDestination(opts CopyOptions) (string, error) {
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
		return "", fmt.Errorf("unknown destination type: %s", opts.Destination)
	}
}

// copyGeneratorFiles copies all files from source to destination
func copyGeneratorFiles(srcDir, destDir string) ([]string, error) {
	var filesCopied []string

	err := filepath.Walk(srcDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Get relative path
		relPath, err := filepath.Rel(srcDir, path)
		if err != nil {
			return err
		}

		destPath := filepath.Join(destDir, relPath)

		if info.IsDir() {
			return os.MkdirAll(destPath, info.Mode())
		}

		// Copy file
		if err := copyFile(path, destPath); err != nil {
			return err
		}

		filesCopied = append(filesCopied, relPath)
		return nil
	})

	return filesCopied, err
}

// copyFile copies a single file
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

// updateManifestName updates the name field in generator.yaml
func updateManifestName(genDir, newName string) error {
	manifestPath := filepath.Join(genDir, DefaultManifestFile)

	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return err
	}

	// Simple string replacement for name field
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

// ExportOptions configures the export operation
type ExportOptions struct {
	// Generator name to export
	Name string

	// OutputPath is the path for the exported archive
	OutputPath string

	// IncludeReadme includes README.md if present
	IncludeReadme bool
}

// ExportResult contains the result of an export operation
type ExportResult struct {
	ArchivePath   string   `json:"archive_path"`
	GeneratorDir  string   `json:"generator_dir"`
	FilesExported []string `json:"files_exported"`
	SizeBytes     int64    `json:"size_bytes"`
}

// Export exports a generator as a .tar.gz archive
func (l *Loader) Export(opts ExportOptions) (*ExportResult, error) {
	// Get source generator
	gen, err := l.GetGenerator(opts.Name)
	if err != nil {
		return nil, err
	}

	// Determine output path
	outputPath := opts.OutputPath
	if outputPath == "" {
		outputPath = fmt.Sprintf("%s.tar.gz", opts.Name)
	}

	// Ensure .tar.gz extension
	if !strings.HasSuffix(outputPath, ".tar.gz") && !strings.HasSuffix(outputPath, ".tgz") {
		outputPath = outputPath + ".tar.gz"
	}

	// Create archive
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

	// Walk generator directory and add files to archive
	err = filepath.Walk(gen.Path, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Skip directories (they're created implicitly)
		if info.IsDir() {
			return nil
		}

		// Skip README if not requested
		if !opts.IncludeReadme && info.Name() == DefaultReadmeFile {
			return nil
		}

		// Get relative path
		relPath, err := filepath.Rel(gen.Path, path)
		if err != nil {
			return err
		}

		// Create tar header
		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}

		// Use generator name as root directory in archive
		header.Name = filepath.Join(opts.Name, relPath)

		if err := tarWriter.WriteHeader(header); err != nil {
			return err
		}

		// Write file content
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

	// Get archive size
	fileInfo, _ := os.Stat(outputPath)
	var size int64
	if fileInfo != nil {
		size = fileInfo.Size()
	}

	return &ExportResult{
		ArchivePath:   outputPath,
		GeneratorDir:  gen.Path,
		FilesExported: filesExported,
		SizeBytes:     size,
	}, nil
}

// InstallSource specifies where to install a generator from
type InstallSource string

const (
	// SourceFile installs from a local .tar.gz file
	SourceFile InstallSource = "file"
	// SourceURL installs from a URL
	SourceURL InstallSource = "url"
	// SourceDirectory installs from a local directory
	SourceDirectory InstallSource = "directory"
)

// InstallOptions configures the install operation
type InstallOptions struct {
	// Source type
	Source InstallSource

	// SourcePath is the path/URL to the generator
	SourcePath string

	// Destination where to install (global, instance, or path)
	Destination CopyDestination

	// DestinationPath is used when Destination is DestPath
	DestinationPath string

	// InstancePath is the target instance (when Destination is DestInstance)
	InstancePath string

	// NewName renames the generator during install (optional)
	NewName string

	// Force overwrites existing generator
	Force bool
}

// InstallResult contains the result of an install operation
type InstallResult struct {
	GeneratorName   string   `json:"generator_name"`
	SourcePath      string   `json:"source_path"`
	DestinationPath string   `json:"destination_path"`
	FilesInstalled  []string `json:"files_installed"`
}

// Install installs a generator from an archive, URL, or directory
func Install(opts InstallOptions) (*InstallResult, error) {
	switch opts.Source {
	case SourceFile:
		return installFromArchive(opts)
	case SourceURL:
		return installFromURL(opts)
	case SourceDirectory:
		return installFromDirectory(opts)
	default:
		return nil, fmt.Errorf("unknown source type: %s", opts.Source)
	}
}

// installFromArchive installs from a .tar.gz file
func installFromArchive(opts InstallOptions) (*InstallResult, error) {
	// Open archive
	file, err := os.Open(opts.SourcePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open archive: %w", err)
	}
	defer file.Close()

	// Create temp directory for extraction
	tempDir, err := os.MkdirTemp("", "epf-generator-*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer os.RemoveAll(tempDir)

	// Extract archive
	gzReader, err := gzip.NewReader(file)
	if err != nil {
		return nil, fmt.Errorf("failed to open gzip reader: %w", err)
	}
	defer gzReader.Close()

	tarReader := tar.NewReader(gzReader)

	var generatorName string
	var filesExtracted []string

	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("failed to read tar: %w", err)
		}

		// Get generator name from first path component
		parts := strings.Split(header.Name, string(filepath.Separator))
		if len(parts) > 0 && generatorName == "" {
			generatorName = parts[0]
		}

		destPath := filepath.Join(tempDir, header.Name)

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(destPath, 0755); err != nil {
				return nil, err
			}
		case tar.TypeReg:
			// Ensure parent directory exists
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

			// Track relative path within generator
			if len(parts) > 1 {
				filesExtracted = append(filesExtracted, filepath.Join(parts[1:]...))
			}
		}
	}

	if generatorName == "" {
		return nil, fmt.Errorf("could not determine generator name from archive")
	}

	// Use new name if provided
	finalName := generatorName
	if opts.NewName != "" {
		finalName = opts.NewName
	}

	// Determine destination
	destDir, err := resolveInstallDestination(opts)
	if err != nil {
		return nil, err
	}

	finalPath := filepath.Join(destDir, finalName)

	// Check if destination exists
	if _, err := os.Stat(finalPath); err == nil {
		if !opts.Force {
			return nil, fmt.Errorf("generator '%s' already exists at %s (use --force to overwrite)", finalName, finalPath)
		}
		os.RemoveAll(finalPath)
	}

	// Ensure destination parent exists
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create destination directory: %w", err)
	}

	// Move from temp to final destination
	extractedPath := filepath.Join(tempDir, generatorName)
	if err := os.Rename(extractedPath, finalPath); err != nil {
		// Rename might fail across filesystems, fallback to copy
		if _, err := copyGeneratorFiles(extractedPath, finalPath); err != nil {
			return nil, fmt.Errorf("failed to install generator: %w", err)
		}
	}

	// Update name in manifest if renamed
	if opts.NewName != "" && opts.NewName != generatorName {
		updateManifestName(finalPath, opts.NewName)
	}

	return &InstallResult{
		GeneratorName:   finalName,
		SourcePath:      opts.SourcePath,
		DestinationPath: finalPath,
		FilesInstalled:  filesExtracted,
	}, nil
}

// installFromURL downloads and installs from a URL
func installFromURL(opts InstallOptions) (*InstallResult, error) {
	// Download to temp file
	tempFile, err := os.CreateTemp("", "epf-generator-*.tar.gz")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp file: %w", err)
	}
	defer os.Remove(tempFile.Name())
	defer tempFile.Close()

	resp, err := http.Get(opts.SourcePath)
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

	// Install from the downloaded file
	opts.Source = SourceFile
	originalPath := opts.SourcePath
	opts.SourcePath = tempFile.Name()

	result, err := installFromArchive(opts)
	if err != nil {
		return nil, err
	}

	// Restore original source path in result
	result.SourcePath = originalPath
	return result, nil
}

// installFromDirectory installs from a local directory
func installFromDirectory(opts InstallOptions) (*InstallResult, error) {
	// Verify source is a valid generator directory
	if !looksLikeGeneratorDir(opts.SourcePath) {
		return nil, fmt.Errorf("source directory does not appear to be a valid generator (no generator.yaml, schema.json, or wizard.instructions.md found)")
	}

	// Determine generator name
	generatorName := filepath.Base(opts.SourcePath)
	if opts.NewName != "" {
		generatorName = opts.NewName
	}

	// Determine destination
	destDir, err := resolveInstallDestination(opts)
	if err != nil {
		return nil, err
	}

	finalPath := filepath.Join(destDir, generatorName)

	// Check if destination exists
	if _, err := os.Stat(finalPath); err == nil {
		if !opts.Force {
			return nil, fmt.Errorf("generator '%s' already exists at %s (use --force to overwrite)", generatorName, finalPath)
		}
		os.RemoveAll(finalPath)
	}

	// Ensure destination parent exists
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create destination directory: %w", err)
	}

	// Copy files
	filesInstalled, err := copyGeneratorFiles(opts.SourcePath, finalPath)
	if err != nil {
		os.RemoveAll(finalPath)
		return nil, fmt.Errorf("failed to copy generator: %w", err)
	}

	// Update name in manifest if renamed
	if opts.NewName != "" && opts.NewName != filepath.Base(opts.SourcePath) {
		updateManifestName(finalPath, opts.NewName)
	}

	return &InstallResult{
		GeneratorName:   generatorName,
		SourcePath:      opts.SourcePath,
		DestinationPath: finalPath,
		FilesInstalled:  filesInstalled,
	}, nil
}

// resolveInstallDestination determines the destination directory for install
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
		// Default to global
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("could not determine home directory: %w", err)
		}
		return filepath.Join(home, ".epf-cli", "generators"), nil
	}
}

// looksLikeGeneratorDir checks if a directory appears to be a generator
func looksLikeGeneratorDir(dir string) bool {
	files := []string{
		DefaultManifestFile,
		DefaultSchemaFile,
		DefaultWizardFile,
	}

	for _, f := range files {
		if _, err := os.Stat(filepath.Join(dir, f)); err == nil {
			return true
		}
	}

	return false
}
