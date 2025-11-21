interface UrlBadgeProps {
  url: string;
  title?: string;
  description?: string;
}

/**
 * UrlBadge - A nice badge component for displaying URLs
 *
 * Features:
 * - Globe icon for visual appeal
 * - Clean badge styling with DaisyUI
 * - Opens URL in new tab
 * - Shows title and description if available
 * - Hover effect
 */
export function UrlBadge({ url, title, description }: UrlBadgeProps) {
  // Extract domain from URL for display
  const getDomain = (urlString: string): string => {
    try {
      const urlObj = new URL(urlString);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return urlString;
    }
  };

  const domain = getDomain(url);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-3 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-lg transition-colors no-underline max-w-md"
    >
      {/* Globe Icon */}
      <span className="iconify lucide--globe size-4 text-primary flex-shrink-0"></span>

      {/* Content */}
      <div className="flex flex-col min-w-0 flex-1">
        {title ? (
          <>
            <span className="text-sm font-medium text-primary truncate">
              {title}
            </span>
            <span className="text-xs text-base-content/60 truncate">
              {domain}
            </span>
          </>
        ) : (
          <span className="text-sm font-medium text-primary truncate">
            {domain}
          </span>
        )}
        {description && (
          <span className="text-xs text-base-content/70 line-clamp-2 mt-0.5">
            {description}
          </span>
        )}
      </div>

      {/* External link icon */}
      <span className="iconify lucide--external-link size-3 text-primary/60 flex-shrink-0"></span>
    </a>
  );
}
