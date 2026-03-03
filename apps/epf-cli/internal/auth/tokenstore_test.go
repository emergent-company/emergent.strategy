package auth

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestTokenStore_SetAndGet(t *testing.T) {
	dir := t.TempDir()
	store := NewTokenStoreAt(filepath.Join(dir, "auth.json"))

	entry := &TokenStoreEntry{
		Token:           "jwt-token-123",
		Username:        "testuser",
		UserID:          42,
		InstancePath:    "org/repo",
		AuthenticatedAt: time.Now().Truncate(time.Second),
	}

	// Set credentials.
	if err := store.Set("https://epf.example.com", entry); err != nil {
		t.Fatalf("Set() error = %v", err)
	}

	// Get credentials.
	got, err := store.Get("https://epf.example.com")
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if got == nil {
		t.Fatal("Get() returned nil, want entry")
	}

	if got.Token != "jwt-token-123" {
		t.Errorf("Token = %q, want jwt-token-123", got.Token)
	}
	if got.Username != "testuser" {
		t.Errorf("Username = %q, want testuser", got.Username)
	}
	if got.UserID != 42 {
		t.Errorf("UserID = %d, want 42", got.UserID)
	}
	if got.InstancePath != "org/repo" {
		t.Errorf("InstancePath = %q, want org/repo", got.InstancePath)
	}
}

func TestTokenStore_GetNonexistent(t *testing.T) {
	dir := t.TempDir()
	store := NewTokenStoreAt(filepath.Join(dir, "auth.json"))

	got, err := store.Get("https://no-such-server.example.com")
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if got != nil {
		t.Errorf("Get() = %v, want nil for nonexistent server", got)
	}
}

func TestTokenStore_GetNoFile(t *testing.T) {
	// Token store file doesn't exist yet.
	store := NewTokenStoreAt("/tmp/nonexistent-epf-test/auth.json")

	got, err := store.Get("https://example.com")
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if got != nil {
		t.Errorf("Get() = %v, want nil when file doesn't exist", got)
	}
}

func TestTokenStore_Delete(t *testing.T) {
	dir := t.TempDir()
	store := NewTokenStoreAt(filepath.Join(dir, "auth.json"))

	// Set then delete.
	entry := &TokenStoreEntry{Token: "jwt-123", Username: "user1", UserID: 1}
	store.Set("https://server1.example.com", entry)

	if err := store.Delete("https://server1.example.com"); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}

	got, err := store.Get("https://server1.example.com")
	if err != nil {
		t.Fatalf("Get() after delete error = %v", err)
	}
	if got != nil {
		t.Error("Get() should return nil after Delete()")
	}
}

func TestTokenStore_DeleteNonexistent(t *testing.T) {
	dir := t.TempDir()
	store := NewTokenStoreAt(filepath.Join(dir, "auth.json"))

	// Deleting a nonexistent server should not error.
	if err := store.Delete("https://no-such-server.example.com"); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
}

func TestTokenStore_MultipleServers(t *testing.T) {
	dir := t.TempDir()
	store := NewTokenStoreAt(filepath.Join(dir, "auth.json"))

	entry1 := &TokenStoreEntry{Token: "jwt-1", Username: "user1", UserID: 1}
	entry2 := &TokenStoreEntry{Token: "jwt-2", Username: "user2", UserID: 2}
	entry3 := &TokenStoreEntry{Token: "jwt-3", Username: "user3", UserID: 3}

	store.Set("https://server1.example.com", entry1)
	store.Set("https://server2.example.com", entry2)
	store.Set("https://server3.example.com", entry3)

	// Verify each server has its own entry.
	got1, _ := store.Get("https://server1.example.com")
	got2, _ := store.Get("https://server2.example.com")
	got3, _ := store.Get("https://server3.example.com")

	if got1.Username != "user1" {
		t.Errorf("server1 username = %q, want user1", got1.Username)
	}
	if got2.Username != "user2" {
		t.Errorf("server2 username = %q, want user2", got2.Username)
	}
	if got3.Username != "user3" {
		t.Errorf("server3 username = %q, want user3", got3.Username)
	}
}

func TestTokenStore_OverwriteEntry(t *testing.T) {
	dir := t.TempDir()
	store := NewTokenStoreAt(filepath.Join(dir, "auth.json"))

	entry1 := &TokenStoreEntry{Token: "old-jwt", Username: "user1", UserID: 1}
	store.Set("https://server.example.com", entry1)

	entry2 := &TokenStoreEntry{Token: "new-jwt", Username: "user1", UserID: 1}
	store.Set("https://server.example.com", entry2)

	got, _ := store.Get("https://server.example.com")
	if got.Token != "new-jwt" {
		t.Errorf("Token = %q, want new-jwt (overwritten)", got.Token)
	}
}

func TestTokenStore_List(t *testing.T) {
	dir := t.TempDir()
	store := NewTokenStoreAt(filepath.Join(dir, "auth.json"))

	// Empty list.
	urls, err := store.List()
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if len(urls) != 0 {
		t.Errorf("List() = %v, want empty", urls)
	}

	// Add entries.
	store.Set("https://a.example.com", &TokenStoreEntry{Token: "jwt-a", Username: "a", UserID: 1})
	store.Set("https://b.example.com", &TokenStoreEntry{Token: "jwt-b", Username: "b", UserID: 2})

	urls, err = store.List()
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if len(urls) != 2 {
		t.Errorf("List() returned %d entries, want 2", len(urls))
	}
}

func TestTokenStore_SetInstancePath(t *testing.T) {
	dir := t.TempDir()
	store := NewTokenStoreAt(filepath.Join(dir, "auth.json"))

	entry := &TokenStoreEntry{Token: "jwt-1", Username: "user1", UserID: 1}
	store.Set("https://server.example.com", entry)

	// Update instance path.
	if err := store.SetInstancePath("https://server.example.com", "org/repo"); err != nil {
		t.Fatalf("SetInstancePath() error = %v", err)
	}

	got, _ := store.Get("https://server.example.com")
	if got.InstancePath != "org/repo" {
		t.Errorf("InstancePath = %q, want org/repo", got.InstancePath)
	}
}

func TestTokenStore_SetInstancePath_NoEntry(t *testing.T) {
	dir := t.TempDir()
	store := NewTokenStoreAt(filepath.Join(dir, "auth.json"))

	err := store.SetInstancePath("https://no-such-server.example.com", "org/repo")
	if err == nil {
		t.Fatal("SetInstancePath() should error for nonexistent server")
	}
}

func TestTokenStore_FilePermissions(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "subdir", "auth.json")
	store := NewTokenStoreAt(path)

	entry := &TokenStoreEntry{Token: "jwt-1", Username: "user1", UserID: 1}
	if err := store.Set("https://server.example.com", entry); err != nil {
		t.Fatalf("Set() error = %v", err)
	}

	// Check file permissions.
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat() error = %v", err)
	}

	perm := info.Mode().Perm()
	if perm != 0600 {
		t.Errorf("file permissions = %o, want 0600", perm)
	}
}

func TestTokenStore_CreatesDirectory(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "deep", "nested", "auth.json")
	store := NewTokenStoreAt(path)

	entry := &TokenStoreEntry{Token: "jwt-1", Username: "user1", UserID: 1}
	if err := store.Set("https://server.example.com", entry); err != nil {
		t.Fatalf("Set() error = %v", err)
	}

	// Verify file was created.
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("file should exist: %v", err)
	}
}

func TestTokenStore_Path(t *testing.T) {
	store := NewTokenStoreAt("/custom/path/auth.json")
	if store.Path() != "/custom/path/auth.json" {
		t.Errorf("Path() = %q, want /custom/path/auth.json", store.Path())
	}
}

func TestNewTokenStore_DefaultPath(t *testing.T) {
	store := NewTokenStore()
	path := store.Path()

	// Should contain the default directory and filename.
	if filepath.Base(path) != DefaultTokenStoreFile {
		t.Errorf("filename = %q, want %q", filepath.Base(path), DefaultTokenStoreFile)
	}

	dir := filepath.Dir(path)
	if filepath.Base(dir) != "epf-cli" {
		t.Errorf("parent dir = %q, want epf-cli", filepath.Base(dir))
	}
}

func TestTokenStore_PersistAcrossInstances(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "auth.json")

	// Write with one instance.
	store1 := NewTokenStoreAt(path)
	entry := &TokenStoreEntry{Token: "jwt-persist", Username: "user1", UserID: 1}
	store1.Set("https://server.example.com", entry)

	// Read with a different instance (simulates CLI restart).
	store2 := NewTokenStoreAt(path)
	got, err := store2.Get("https://server.example.com")
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if got == nil {
		t.Fatal("Get() returned nil, want persisted entry")
	}
	if got.Token != "jwt-persist" {
		t.Errorf("Token = %q, want jwt-persist", got.Token)
	}
}
