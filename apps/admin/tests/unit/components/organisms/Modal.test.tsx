import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { Modal } from '@/components/organisms/Modal/Modal';

const setup = () => {
  const onOpenChange = vi.fn();
  render(
    <Modal
      open
      onOpenChange={onOpenChange}
      title="Test Modal"
      description="Description"
      actions={[
        {
          label: 'Close',
          variant: 'ghost',
          onClick: () => onOpenChange(false, 'close-button'),
          autoFocus: true,
        },
      ]}
    >
      <p>Body</p>
    </Modal>
  );
  return { onOpenChange };
};

describe('Modal', () => {
  it('renders title and body', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Test Modal' })).not.toBeNull();
    expect(screen.getByText('Body')).not.toBeNull();
  });

  it('calls onOpenChange when close button clicked', () => {
    const { onOpenChange } = setup();
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);
    expect(onOpenChange).toHaveBeenCalled();
  });
});
