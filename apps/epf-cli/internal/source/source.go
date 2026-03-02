// Package source provides a filesystem abstraction for reading EPF artifacts.
//
// The Source interface decouples EPF artifact loading from the local filesystem,
// enabling artifacts to be read from GitHub repositories, in-memory caches, or
// other backends. All paths are forward-slash-separated and relative to a root
// (e.g., an EPF instance directory or a repository root).
//
// Implementations:
//   - FileSystemSource: reads from local disk (wraps os/filepath)
//   - GitHubSource: reads from GitHub repositories via the Contents API
//   - CachedSource: wraps any Source with in-memory TTL cache and Singleflight deduplication
package source

import (
	"io/fs"
)

// Source abstracts read-only access to a tree of files.
//
// All path arguments use forward slashes and are relative to the source root.
// Implementations must be safe for concurrent use.
type Source interface {
	// ReadFile returns the contents of the named file.
	// It is analogous to os.ReadFile.
	ReadFile(path string) ([]byte, error)

	// ReadDir returns the directory entries for the named directory,
	// sorted by name. It is analogous to os.ReadDir.
	ReadDir(path string) ([]fs.DirEntry, error)

	// Stat returns file info for the named path.
	// It is analogous to os.Stat.
	Stat(path string) (fs.FileInfo, error)

	// Walk walks the file tree rooted at root, calling fn for each file
	// or directory in the tree. It is analogous to filepath.WalkDir.
	Walk(root string, fn fs.WalkDirFunc) error

	// Root returns the absolute root path of this source.
	// For filesystem sources this is the directory path.
	// For remote sources this may be a synthetic path like "github://owner/repo".
	Root() string
}
