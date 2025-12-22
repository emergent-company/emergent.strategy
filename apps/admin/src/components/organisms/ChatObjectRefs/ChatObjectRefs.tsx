import { useState } from 'react';
import { ObjectRefCard } from '@/components/molecules/ObjectRefCard';
import { ObjectDetailModal } from '@/components/organisms/ObjectDetailModal';
import type { GraphObject } from '@/components/organisms/ObjectBrowser/ObjectBrowser';
import { useApi } from '@/hooks/use-api';
import { Spinner } from '@/components/atoms/Spinner';

export interface ObjectRef {
  id: string;
  type: string;
  name: string;
  summary?: string;
}

export interface ChatObjectRefsProps {
  /** Parsed object references from ```object-ref blocks */
  refs: ObjectRef[];
}

/**
 * Renders a list of object reference cards from chat responses.
 * Handles clicking to fetch and display full object details in modal.
 *
 * @example
 * ```tsx
 * const refs = parseObjectRefs(chatMessage.content);
 * return <ChatObjectRefs refs={refs} />;
 * ```
 */
export function ChatObjectRefs({ refs }: ChatObjectRefsProps) {
  const { fetchJson } = useApi();
  const [selectedObject, setSelectedObject] = useState<GraphObject | null>(
    null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCardClick = async (objectId: string) => {
    setLoading(true);
    setError(null);

    try {
      // Fetch full object details from API
      const obj = await fetchJson<GraphObject>(
        `/api/graph/objects/${objectId}`
      );
      setSelectedObject(obj);
      setIsModalOpen(true);
    } catch (err) {
      console.error('Failed to load object details:', err);
      setError('Failed to load object details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedObject(null);
    setError(null);
  };

  if (refs.length === 0) return null;

  return (
    <>
      <div className="space-y-2 my-3">
        {refs.map((ref) => (
          <ObjectRefCard
            key={ref.id}
            id={ref.id}
            type={ref.type}
            name={ref.name}
            summary={ref.summary}
            onClick={() => handleCardClick(ref.id)}
          />
        ))}

        {/* Loading spinner */}
        {loading && (
          <div className="flex justify-center py-2">
            <Spinner size="sm" />
          </div>
        )}

        {/* Error alert */}
        {error && (
          <div className="alert alert-error alert-sm">
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <ObjectDetailModal
        object={selectedObject}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </>
  );
}

/**
 * Parse ```object-ref code blocks from markdown text.
 * Each block should contain JSON with: { id, type, name, summary? }
 *
 * @example
 * ```tsx
 * const markdown = `
 * Here are some objects:
 *
 * \`\`\`object-ref
 * {
 *   "id": "abc123",
 *   "type": "Risk",
 *   "name": "Security vulnerability",
 *   "summary": "XSS attack vector"
 * }
 * \`\`\`
 * `;
 *
 * const refs = parseObjectRefs(markdown);
 * // [{ id: "abc123", type: "Risk", name: "Security vulnerability", summary: "XSS attack vector" }]
 * ```
 */
export function parseObjectRefs(markdown: string): ObjectRef[] {
  const refs: ObjectRef[] = [];
  const regex = /```object-ref\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(markdown)) !== null) {
    try {
      const json = JSON.parse(match[1]);
      // Validate required fields
      if (json.id && json.type && json.name) {
        refs.push({
          id: json.id,
          type: json.type,
          name: json.name,
          summary: json.summary,
        });
      } else {
        console.warn('Object ref missing required fields:', json);
      }
    } catch (err) {
      console.warn('Failed to parse object-ref block:', match[1], err);
    }
  }

  return refs;
}

/**
 * Remove ```object-ref blocks from markdown to avoid rendering them as code.
 * This should be called AFTER parseObjectRefs() to extract the references first.
 *
 * @example
 * ```tsx
 * const markdown = "Text before\n```object-ref\n{...}\n```\nText after";
 * const cleanMarkdown = stripObjectRefBlocks(markdown);
 * // "Text before\n\nText after"
 * ```
 */
export function stripObjectRefBlocks(markdown: string): string {
  return markdown.replace(/```object-ref\n[\s\S]*?```/g, '').trim();
}
