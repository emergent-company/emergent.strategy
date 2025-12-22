import { Link, useParams } from 'react-router';
import { MetaData } from '@/components';
import { useRelease } from '@/hooks/use-releases';
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
 * Changelog section component
 */
function ChangelogSection({
  title,
  items,
  icon,
  variant = 'default',
}: {
  title: string;
  items: string[];
  icon: string;
  variant?: 'default' | 'warning' | 'success' | 'info';
}) {
  if (!items || items.length === 0) return null;

  const variantClasses = {
    default: 'border-base-300',
    warning: 'border-warning/50 bg-warning/5',
    success: 'border-success/50 bg-success/5',
    info: 'border-info/50 bg-info/5',
  };

  return (
    <div className={`border rounded-lg p-4 mb-4 ${variantClasses[variant]}`}>
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <span>{icon}</span>
        {title}
        <span className="badge badge-sm">{items.length}</span>
      </h3>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="text-base-content/40 mt-1">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Public release detail page.
 * Shows full changelog for a specific version.
 */
const ReleaseDetailPage = () => {
  const { version } = useParams<{ version: string }>();
  const { release, isLoading, error } = useRelease(version);

  return (
    <div data-testid="page-release-detail">
      <MetaData title={`${version || 'Release'} | Emergent`} />

      <ProductTopbar />

      <main className="min-h-screen bg-base-100 pt-16">
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          {/* Back link */}
          <Link
            to="/releases"
            className="inline-flex items-center gap-2 text-base-content/60 hover:text-base-content mb-8 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to all releases
          </Link>

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
              <span>{error.message}</span>
            </div>
          )}

          {/* Release Content */}
          {!isLoading && !error && release && (
            <>
              {/* Header */}
              <div className="mb-8">
                <h1 className="text-4xl font-bold font-mono mb-2">
                  {release.version}
                </h1>
                <div className="flex items-center gap-4 text-base-content/60">
                  <span>{formatDate(release.createdAt)}</span>
                  <span>•</span>
                  <span>
                    {release.commitCount}{' '}
                    {release.commitCount === 1 ? 'commit' : 'commits'}
                  </span>
                </div>
              </div>

              {/* Summary */}
              {release.changelogJson?.summary && (
                <div className="prose prose-lg max-w-none mb-8">
                  <p className="text-xl text-base-content/80 leading-relaxed">
                    {release.changelogJson.summary}
                  </p>
                </div>
              )}

              {/* Changelog Sections */}
              {release.changelogJson ? (
                <div className="space-y-2">
                  <ChangelogSection
                    title="Breaking Changes"
                    items={release.changelogJson.breakingChanges}
                    icon="⚠️"
                    variant="warning"
                  />
                  <ChangelogSection
                    title="New Features"
                    items={release.changelogJson.features}
                    icon="✨"
                    variant="success"
                  />
                  <ChangelogSection
                    title="Improvements"
                    items={release.changelogJson.improvements}
                    icon="📈"
                    variant="info"
                  />
                  <ChangelogSection
                    title="Bug Fixes"
                    items={release.changelogJson.bugFixes}
                    icon="🐛"
                  />
                  <ChangelogSection
                    title="Other Changes"
                    items={release.changelogJson.otherChanges}
                    icon="📝"
                  />
                </div>
              ) : (
                <div className="text-center py-8 text-base-content/60">
                  <p>No detailed changelog available for this release.</p>
                </div>
              )}

              {/* Commit Range */}
              <div className="mt-8 pt-8 border-t border-base-300">
                <h3 className="text-sm font-semibold text-base-content/60 mb-2">
                  Commit Range
                </h3>
                <code className="text-sm bg-base-200 px-3 py-2 rounded block overflow-x-auto">
                  {release.fromCommit.substring(0, 7)}...
                  {release.toCommit.substring(0, 7)}
                </code>
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ReleaseDetailPage;
