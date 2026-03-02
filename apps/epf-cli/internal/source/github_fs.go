package source

import (
	"io/fs"
	"time"
)

// ghDirEntry implements fs.DirEntry backed by a GitHub Contents API entry.
type ghDirEntry struct {
	entry ghContentsEntry
}

var _ fs.DirEntry = (*ghDirEntry)(nil)

// Name returns the base name of the entry.
func (d *ghDirEntry) Name() string {
	return d.entry.Name
}

// IsDir reports whether the entry describes a directory.
func (d *ghDirEntry) IsDir() bool {
	return d.entry.Type == "dir"
}

// Type returns the type bits for the entry (directory or regular file).
func (d *ghDirEntry) Type() fs.FileMode {
	if d.IsDir() {
		return fs.ModeDir
	}
	return 0
}

// Info returns the FileInfo for the entry.
func (d *ghDirEntry) Info() (fs.FileInfo, error) {
	return &ghFileInfo{entry: d.entry}, nil
}

// ghFileInfo implements fs.FileInfo backed by a GitHub Contents API entry.
// The GitHub Contents API does not provide modification times, so ModTime
// returns the zero value. Size is only meaningful for file entries.
type ghFileInfo struct {
	entry ghContentsEntry
}

var _ fs.FileInfo = (*ghFileInfo)(nil)

// Name returns the base name of the file.
func (fi *ghFileInfo) Name() string {
	return fi.entry.Name
}

// Size returns the size in bytes. For directories this is 0.
func (fi *ghFileInfo) Size() int64 {
	if fi.entry.Type == "dir" {
		return 0
	}
	return fi.entry.Size
}

// Mode returns the file mode bits.
func (fi *ghFileInfo) Mode() fs.FileMode {
	if fi.entry.Type == "dir" {
		return fs.ModeDir | 0o755
	}
	return 0o644
}

// ModTime returns the modification time. The GitHub Contents API does not
// provide this information, so the zero time is returned.
func (fi *ghFileInfo) ModTime() time.Time {
	return time.Time{}
}

// IsDir reports whether the entry describes a directory.
func (fi *ghFileInfo) IsDir() bool {
	return fi.entry.Type == "dir"
}

// Sys returns the underlying data source. Returns nil since there is
// no OS-level backing for GitHub API entries.
func (fi *ghFileInfo) Sys() any {
	return nil
}
