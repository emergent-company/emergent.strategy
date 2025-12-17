interface UrlBadgeProps {
  url: string;
  title?: string;
}

/**
 * UrlBadge - A compact single-line badge component for displaying URLs
 *
 * Features:
 * - Globe icon for visual appeal
 * - Clean badge styling with DaisyUI
 * - Opens URL in new tab
 * - Shows title and domain on a single line
 * - Hover effect
 */
export function UrlBadge({ url, title }: UrlBadgeProps) {
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
      className="inline-flex items-center gap-1 no-underline hover:underline"
    >
      {/* Globe Icon */}
      <span className="iconify lucide--globe size-3.5 text-info flex-shrink-0"></span>

      {/* Title */}
      {title && <span className="text-info">{title}</span>}

      {/* Domain */}
      <span className="text-base-content/50">{domain}</span>

      {/* External link icon */}
      <span className="iconify lucide--external-link size-3 text-base-content/50 flex-shrink-0"></span>
    </a>
  );
}
