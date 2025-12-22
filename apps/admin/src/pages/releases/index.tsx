import { Link } from 'react-router';
import { MetaData } from '@/components';
import { useReleases } from '@/hooks/use-releases';
import { Spinner } from '@/components/atoms/Spinner';
import { ProductTopbar } from '@/components/organisms/ProductTopbar';
import { Footer } from '@/pages/landing/components/Footer';

/**
 * Format a date string to a human-readable format
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Public releases list page.
 * Shows all release versions with links to detail pages.
 */
const ReleasesPage = () => {
  const { releases, isLoading, error } = useReleases(50);

  return (
    <div data-testid="page-releases">
      <MetaData title="Release Notes | Emergent" />

      <ProductTopbar />

      <main className="min-h-screen bg-base-100 pt-16">
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-4xl font-bold mb-4">Release Notes</h1>
            <p className="text-base-content/70 text-lg">
              Stay up to date with the latest features, improvements, and bug
              fixes.
            </p>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex justify-center items-center py-12">
              <Spinner size="lg" />
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="alert alert-error">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="stroke-current shrink-0 h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>Failed to load releases: {error.message}</span>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && releases.length === 0 && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📦</div>
              <h2 className="text-2xl font-semibold mb-2">No releases yet</h2>
              <p className="text-base-content/70">
                Check back soon for updates!
              </p>
            </div>
          )}

          {/* Releases List */}
          {!isLoading && !error && releases.length > 0 && (
            <div className="space-y-4">
              {releases.map((release) => (
                <Link
                  key={release.id}
                  to={`/releases/${release.version}`}
                  className="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer"
                >
                  <div className="card-body p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="card-title text-xl font-mono">
                          {release.version}
                        </h2>
                        <p className="text-base-content/60 text-sm mt-1">
                          {formatDate(release.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="badge badge-neutral">
                          {release.commitCount}{' '}
                          {release.commitCount === 1 ? 'commit' : 'commits'}
                        </div>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5 text-base-content/40"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ReleasesPage;
