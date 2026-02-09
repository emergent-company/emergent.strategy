package strategy

import (
	"context"
	"path/filepath"
	"testing"
)

// BenchmarkFileSystemSource_Load benchmarks the initial loading of the strategy store.
func BenchmarkFileSystemSource_Load(b *testing.B) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	ctx := context.Background()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		store := NewFileSystemSource(instancePath)
		if err := store.Load(ctx); err != nil {
			b.Fatalf("Load() error = %v", err)
		}
		store.Close()
	}
}

// BenchmarkFileSystemSource_Reload benchmarks reloading the strategy store.
func BenchmarkFileSystemSource_Reload(b *testing.B) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	ctx := context.Background()

	store := NewFileSystemSource(instancePath)
	if err := store.Load(ctx); err != nil {
		b.Fatalf("Load() error = %v", err)
	}
	defer store.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if err := store.Reload(ctx); err != nil {
			b.Fatalf("Reload() error = %v", err)
		}
	}
}

// BenchmarkSearch_SimpleQuery benchmarks search with a simple single-word query.
func BenchmarkSearch_SimpleQuery(b *testing.B) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	ctx := context.Background()

	store := NewFileSystemSource(instancePath)
	if err := store.Load(ctx); err != nil {
		b.Fatalf("Load() error = %v", err)
	}
	defer store.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := store.Search("knowledge", 10)
		if err != nil {
			b.Fatalf("Search() error = %v", err)
		}
	}
}

// BenchmarkSearch_ComplexQuery benchmarks search with a multi-word query.
func BenchmarkSearch_ComplexQuery(b *testing.B) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	ctx := context.Background()

	store := NewFileSystemSource(instancePath)
	if err := store.Load(ctx); err != nil {
		b.Fatalf("Load() error = %v", err)
	}
	defer store.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := store.Search("AI powered knowledge extraction graph", 10)
		if err != nil {
			b.Fatalf("Search() error = %v", err)
		}
	}
}

// BenchmarkSearch_LargeLimit benchmarks search returning many results.
func BenchmarkSearch_LargeLimit(b *testing.B) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	ctx := context.Background()

	store := NewFileSystemSource(instancePath)
	if err := store.Load(ctx); err != nil {
		b.Fatalf("Load() error = %v", err)
	}
	defer store.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := store.Search("the", 100) // Common word to get many results
		if err != nil {
			b.Fatalf("Search() error = %v", err)
		}
	}
}

// BenchmarkGetStrategicContext benchmarks strategic context synthesis.
func BenchmarkGetStrategicContext(b *testing.B) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	ctx := context.Background()

	store := NewFileSystemSource(instancePath)
	if err := store.Load(ctx); err != nil {
		b.Fatalf("Load() error = %v", err)
	}
	defer store.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := store.GetStrategicContext("knowledge graph feature implementation")
		if err != nil {
			b.Fatalf("GetStrategicContext() error = %v", err)
		}
	}
}

// BenchmarkGetPersonas benchmarks persona retrieval.
func BenchmarkGetPersonas(b *testing.B) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	ctx := context.Background()

	store := NewFileSystemSource(instancePath)
	if err := store.Load(ctx); err != nil {
		b.Fatalf("Load() error = %v", err)
	}
	defer store.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := store.GetPersonas()
		if err != nil {
			b.Fatalf("GetPersonas() error = %v", err)
		}
	}
}

// BenchmarkGetRoadmapSummary benchmarks roadmap retrieval.
func BenchmarkGetRoadmapSummary(b *testing.B) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	ctx := context.Background()

	store := NewFileSystemSource(instancePath)
	if err := store.Load(ctx); err != nil {
		b.Fatalf("Load() error = %v", err)
	}
	defer store.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := store.GetRoadmapSummary("", 0)
		if err != nil {
			b.Fatalf("GetRoadmapSummary() error = %v", err)
		}
	}
}

// BenchmarkGetFeatures benchmarks feature listing.
func BenchmarkGetFeatures(b *testing.B) {
	instancePath := filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent")
	ctx := context.Background()

	store := NewFileSystemSource(instancePath)
	if err := store.Load(ctx); err != nil {
		b.Fatalf("Load() error = %v", err)
	}
	defer store.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := store.GetFeatures("")
		if err != nil {
			b.Fatalf("GetFeatures() error = %v", err)
		}
	}
}
