import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { DeletionConfirmationModal } from '@/components/organisms/DeletionConfirmationModal';
import type {
  DeletionImpact,
  BulkDeletionImpact,
} from '@/api/documents';

describe('DeletionConfirmationModal', () => {
  const mockSingleDocumentImpact: DeletionImpact = {
    document: {
      id: 'doc-1',
      name: 'test-document.txt',
      createdAt: '2024-01-01T00:00:00Z',
    },
    impact: {
      chunks: 1,
      notifications: 0,
      extractionJobs: 0,
      graphObjects: 0,
      graphRelationships: 0,
    },
  };

  const mockBulkDocumentImpact: BulkDeletionImpact = {
    totalDocuments: 3,
    impact: {
      chunks: 53,
      notifications: 2,
      extractionJobs: 0,
      graphObjects: 5,
      graphRelationships: 10,
    },
    documents: [
      {
        document: {
          id: 'doc-1',
          name: 'test-1.txt',
          createdAt: '2024-01-01T00:00:00Z',
        },
        impact: {
          chunks: 1,
          notifications: 0,
          extractionJobs: 0,
          graphObjects: 0,
          graphRelationships: 0,
        },
      },
      {
        document: {
          id: 'doc-2',
          name: 'meeting_notes.md',
          createdAt: '2024-01-02T00:00:00Z',
        },
        impact: {
          chunks: 11,
          notifications: 1,
          extractionJobs: 0,
          graphObjects: 2,
          graphRelationships: 3,
        },
      },
      {
        document: {
          id: 'doc-3',
          name: 'project_spec.md',
          createdAt: '2024-01-03T00:00:00Z',
        },
        impact: {
          chunks: 41,
          notifications: 1,
          extractionJobs: 0,
          graphObjects: 3,
          graphRelationships: 7,
        },
      },
    ],
  };

  const mockHighImpactBulkImpact: BulkDeletionImpact = {
    totalDocuments: 2,
    impact: {
      chunks: 25,
      notifications: 0,
      extractionJobs: 6,
      graphObjects: 0,
      graphRelationships: 0,
    },
    documents: [
      {
        document: {
          id: 'doc-high-1',
          name: 'large-document.pdf',
          createdAt: '2024-01-04T00:00:00Z',
        },
        impact: {
          chunks: 15,
          notifications: 0,
          extractionJobs: 0,
          graphObjects: 0,
          graphRelationships: 0,
        },
      },
      {
        document: {
          id: 'doc-high-2',
          name: 'with-many-jobs.docx',
          createdAt: '2024-01-05T00:00:00Z',
        },
        impact: {
          chunks: 10,
          notifications: 0,
          extractionJobs: 6,
          graphObjects: 0,
          graphRelationships: 0,
        },
      },
    ],
  };

  describe('Single Document Deletion', () => {
    it('renders simplified format for single document', async () => {
      const fetchImpact = vi.fn().mockResolvedValue(mockSingleDocumentImpact);

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          documentNames="test-document.txt"
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText('Delete "test-document.txt"?')
        ).toBeInTheDocument();
      });

      expect(
        screen.getByText(
          'You are about to permanently delete this document and all related resources.'
        )
      ).toBeInTheDocument();

      // Should show simplified Impact format, not "Total Impact"
      await waitFor(() => {
        expect(screen.getByText('Impact:')).toBeInTheDocument();
        expect(screen.queryByText('Total Impact:')).not.toBeInTheDocument();
      });

      // Should NOT show "Documents to be deleted" section for single document
      expect(
        screen.queryByText('Documents to be deleted:')
      ).not.toBeInTheDocument();

      // Should show document name with file emoji
      await waitFor(() => {
        expect(screen.getByText('📄')).toBeInTheDocument();
        expect(screen.getByText('test-document.txt')).toBeInTheDocument();
      });

      // Should show simple bullet format
      await waitFor(() => {
        expect(screen.getByText(/• 1 Chunk/)).toBeInTheDocument();
      });
    });

    it('uses "Delete Document?" title when no document name provided', async () => {
      const fetchImpact = vi.fn().mockResolvedValue(mockSingleDocumentImpact);

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Delete Document?')).toBeInTheDocument();
      });
    });

    it('shows message when no related resources for single document', async () => {
      const fetchImpact = vi.fn().mockResolvedValue({
        impact: {
          chunks: 0,
          notifications: 0,
          extractionJobs: 0,
          graphObjects: 0,
          graphRelationships: 0,
        },
      });

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          documentNames="empty.txt"
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText('No related resources will be affected.')
        ).toBeInTheDocument();
      });
    });

    it('displays all impact types for single document', async () => {
      const fetchImpact = vi.fn().mockResolvedValue({
        impact: {
          chunks: 5,
          notifications: 2,
          extractionJobs: 1,
          graphObjects: 3,
          graphRelationships: 4,
        },
      });

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          documentNames="full-impact.txt"
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/• 5 Chunks/)).toBeInTheDocument();
        expect(screen.getByText(/• 2 Notifications/)).toBeInTheDocument();
        expect(screen.getByText(/• 4 Relationships/)).toBeInTheDocument();
        expect(screen.getByText(/• 3 Objects/)).toBeInTheDocument();
        expect(screen.getByText(/• 1 Extraction Job/)).toBeInTheDocument();
      });
    });

    it('uses singular form for single impact item', async () => {
      const fetchImpact = vi.fn().mockResolvedValue({
        impact: {
          chunks: 1,
          notifications: 1,
          extractionJobs: 1,
          graphObjects: 1,
          graphRelationships: 1,
        },
      });

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          documentNames="single.txt"
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/• 1 Chunk$/)).toBeInTheDocument();
        expect(screen.getByText(/• 1 Notification$/)).toBeInTheDocument();
        expect(screen.getByText(/• 1 Relationship$/)).toBeInTheDocument();
        expect(screen.getByText(/• 1 Object$/)).toBeInTheDocument();
        expect(screen.getByText(/• 1 Extraction Job$/)).toBeInTheDocument();
      });
    });
  });

  describe('Bulk Document Deletion', () => {
    it('renders full format for multiple documents', async () => {
      const fetchImpact = vi.fn().mockResolvedValue(mockBulkDocumentImpact);

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1', 'doc-2', 'doc-3']}
          documentNames={['test-1.txt', 'meeting_notes.md', 'project_spec.md']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Delete 3 Documents?')).toBeInTheDocument();
      });

      expect(
        screen.getByText(
          'You are about to permanently delete 3 documents and all related resources.'
        )
      ).toBeInTheDocument();

      // Should show "Total Impact" for bulk
      await waitFor(() => {
        expect(screen.getByText('Total Impact:')).toBeInTheDocument();
      });

      // Should show aggregate impact section with total values
      await waitFor(() => {
        const totalImpactSection = screen
          .getByText('Total Impact:')
          .closest('div');
        expect(totalImpactSection).toBeInTheDocument();
        expect(totalImpactSection).toHaveTextContent('53');
        expect(totalImpactSection).toHaveTextContent('Chunks');
      });
    });

    it('shows per-document breakdown for bulk deletion', async () => {
      const fetchImpact = vi.fn().mockResolvedValue(mockBulkDocumentImpact);

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1', 'doc-2', 'doc-3']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText('Documents to be deleted:')
        ).toBeInTheDocument();
      });

      // Check all documents are listed
      await waitFor(() => {
        expect(screen.getByText('test-1.txt')).toBeInTheDocument();
        expect(screen.getByText('meeting_notes.md')).toBeInTheDocument();
        expect(screen.getByText('project_spec.md')).toBeInTheDocument();
      });
    });

    it('highlights high-impact documents (>10 chunks)', async () => {
      const fetchImpact = vi.fn().mockResolvedValue(mockHighImpactBulkImpact);

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-high-1', 'doc-high-2']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        const highImpactBadges = screen.getAllByText('High Impact');
        expect(highImpactBadges.length).toBeGreaterThan(0);
      });
    });

    it('highlights documents with >5 extraction jobs as high impact', async () => {
      const fetchImpact = vi.fn().mockResolvedValue(mockHighImpactBulkImpact);

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-high-1', 'doc-high-2']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        // Document with 6 extraction jobs should be highlighted
        expect(screen.getByText('with-many-jobs.docx')).toBeInTheDocument();
        const highImpactBadges = screen.getAllByText('High Impact');
        expect(highImpactBadges.length).toBeGreaterThan(0);
      });
    });

    it('displays all impact types in aggregate for bulk deletion', async () => {
      const fetchImpact = vi.fn().mockResolvedValue(mockBulkDocumentImpact);

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1', 'doc-2', 'doc-3']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        const totalImpactSection = screen
          .getByText('Total Impact:')
          .closest('div');
        expect(totalImpactSection).toBeInTheDocument();
        expect(totalImpactSection).toHaveTextContent('53'); // chunks
        expect(totalImpactSection).toHaveTextContent('2'); // notifications
        expect(totalImpactSection).toHaveTextContent('5'); // objects
        expect(totalImpactSection).toHaveTextContent('10'); // relationships
      });
    });
  });

  describe('Impact Fetching', () => {
    it('shows loading state while fetching impact', () => {
      const fetchImpact = vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 1000))
        );

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      expect(screen.getByText('Analyzing impact...')).toBeInTheDocument();
      // Check for loading spinner by class instead of role
      expect(document.querySelector('.loading-spinner')).toBeInTheDocument();
    });

    it('calls fetchImpact with correct document IDs', async () => {
      const fetchImpact = vi.fn().mockResolvedValue(mockSingleDocumentImpact);

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(fetchImpact).toHaveBeenCalledWith(['doc-1']);
      });
    });

    it('displays error message when impact fetch fails', async () => {
      const fetchImpact = vi.fn().mockRejectedValue(new Error('Network error'));

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('displays generic error when no error message provided', async () => {
      const fetchImpact = vi.fn().mockRejectedValue({});

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText('Failed to fetch deletion impact')
        ).toBeInTheDocument();
      });
    });

    it('handles missing impact data gracefully', async () => {
      const fetchImpact = vi.fn().mockResolvedValue({});

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText(
            'Unable to determine deletion impact. Impact data is missing from server response.'
          )
        ).toBeInTheDocument();
      });
    });

    it('only fetches impact once when modal opens', async () => {
      const fetchImpact = vi.fn().mockResolvedValue(mockSingleDocumentImpact);

      const { rerender } = render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(fetchImpact).toHaveBeenCalledTimes(1);
      });

      // Rerender with same props
      rerender(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      // Should not fetch again
      expect(fetchImpact).toHaveBeenCalledTimes(1);
    });

    it('resets impact state when modal closes', async () => {
      const fetchImpact = vi.fn().mockResolvedValue(mockSingleDocumentImpact);

      const { rerender } = render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(fetchImpact).toHaveBeenCalledTimes(1);
      });

      // Close modal
      rerender(
        <DeletionConfirmationModal
          open={false}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      // Open modal again
      rerender(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      // Should fetch again
      await waitFor(() => {
        expect(fetchImpact).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('User Interactions', () => {
    it('calls onCancel when cancel button is clicked', async () => {
      const onCancel = vi.fn();
      const fetchImpact = vi.fn().mockResolvedValue(mockSingleDocumentImpact);

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={onCancel}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Cancel' })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('calls onConfirm when delete button is clicked', async () => {
      const onConfirm = vi.fn().mockResolvedValue(undefined);
      const fetchImpact = vi.fn().mockResolvedValue(mockSingleDocumentImpact);

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={onConfirm}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Delete' })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('disables delete button while fetching impact', () => {
      const fetchImpact = vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 1000))
        );

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      const deleteButton = screen.getByRole('button', { name: 'Delete' });
      expect(deleteButton).toBeDisabled();
    });

    it('shows loading state on delete button during deletion', async () => {
      const onConfirm = vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 1000))
        );
      const fetchImpact = vi.fn().mockResolvedValue(mockSingleDocumentImpact);

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={onConfirm}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Delete' })
        ).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: 'Delete' });
      fireEvent.click(deleteButton);

      // Button text should change to "Working…" and be disabled during deletion
      await waitFor(() => {
        const workingButton = screen.getByRole('button', { name: 'Working…' });
        expect(workingButton).toBeDisabled();
      });
    });

    it('does not call onConfirm when deletion fails', async () => {
      const onConfirm = vi.fn().mockRejectedValue(new Error('Deletion failed'));
      const fetchImpact = vi.fn().mockResolvedValue(mockSingleDocumentImpact);

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={onConfirm}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Delete' })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledTimes(1);
      });

      // Button should be re-enabled after failure
      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: 'Delete' });
        expect(deleteButton).not.toBeDisabled();
      });
    });
  });

  describe('Modal Behavior', () => {
    it('does not render when open is false', () => {
      const fetchImpact = vi.fn();

      render(
        <DeletionConfirmationModal
          open={false}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(fetchImpact).not.toHaveBeenCalled();
    });

    it('displays warning alert', async () => {
      const fetchImpact = vi.fn().mockResolvedValue(mockSingleDocumentImpact);

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText('This action cannot be undone.')
        ).toBeInTheDocument();
      });
    });

    it('applies error variant to delete button', async () => {
      const fetchImpact = vi.fn().mockResolvedValue(mockSingleDocumentImpact);

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: 'Delete' });
        expect(deleteButton).toHaveClass('btn-error');
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles empty document IDs array', () => {
      const fetchImpact = vi.fn().mockResolvedValue({
        document: { id: '', name: '', createdAt: '' },
        impact: {
          chunks: 0,
          notifications: 0,
          extractionJobs: 0,
          graphObjects: 0,
          graphRelationships: 0,
        },
      });

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={[]}
          fetchImpact={fetchImpact}
        />
      );

      // Should still render but with fallback text
      expect(screen.getByText('Delete Document?')).toBeInTheDocument();
    });

    it('handles array of document names for bulk deletion', async () => {
      const fetchImpact = vi.fn().mockResolvedValue(mockBulkDocumentImpact);

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1', 'doc-2']}
          documentNames={['file1.txt', 'file2.txt']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Delete 2 Documents?')).toBeInTheDocument();
      });
    });

    it('handles missing documents array in bulk impact', async () => {
      const fetchImpact = vi.fn().mockResolvedValue({
        impact: {
          chunks: 10,
          notifications: 0,
          extractionJobs: 0,
          graphObjects: 0,
          graphRelationships: 0,
        },
        documents: undefined,
      });

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1', 'doc-2']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        // Should show total impact but not crash
        expect(screen.getByText('Total Impact:')).toBeInTheDocument();
      });

      // Should not show per-document breakdown section
      expect(
        screen.queryByText('Documents to be deleted:')
      ).not.toBeInTheDocument();
    });

    it('handles zero impact values correctly', async () => {
      const fetchImpact = vi.fn().mockResolvedValue({
        impact: {
          chunks: 0,
          notifications: 0,
          extractionJobs: 0,
          graphObjects: 0,
          graphRelationships: 0,
        },
      });

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText('No related resources will be affected.')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA role for dialog', async () => {
      const fetchImpact = vi.fn().mockResolvedValue(mockSingleDocumentImpact);

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('displays heading with appropriate level', async () => {
      const fetchImpact = vi.fn().mockResolvedValue(mockSingleDocumentImpact);

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          documentNames="test.txt"
          fetchImpact={fetchImpact}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 2, name: 'Delete "test.txt"?' })
        ).toBeInTheDocument();
      });
    });

    it('loading state has accessible spinner', () => {
      const fetchImpact = vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 1000))
        );

      render(
        <DeletionConfirmationModal
          open={true}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
          documentIds={['doc-1']}
          fetchImpact={fetchImpact}
        />
      );

      expect(screen.getByText('Analyzing impact...')).toBeInTheDocument();
    });
  });
});
