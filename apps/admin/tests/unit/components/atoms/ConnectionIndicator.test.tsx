import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the data-updates context
const mockReconnect = vi.fn();
let mockConnectionState = 'connected';

vi.mock('@/contexts/data-updates', () => ({
  useDataUpdatesConnection: () => ({
    connectionState: mockConnectionState,
    connectionId: 'test-connection-id',
    reconnect: mockReconnect,
  }),
}));

// Import after mocking
import { ConnectionIndicator } from '@/components/atoms/ConnectionIndicator/ConnectionIndicator';

describe('ConnectionIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectionState = 'connected';
  });

  describe('rendering', () => {
    it('should render without label by default', () => {
      render(<ConnectionIndicator />);

      // Should have an element with title (indicator container)
      const indicator = screen.getByTitle('Connected');
      expect(indicator).toBeInTheDocument();

      // Should not show label text by default
      expect(screen.queryByText('Connected')).not.toBeInTheDocument();
    });

    it('should render with label when showLabel is true', () => {
      render(<ConnectionIndicator showLabel />);

      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(<ConnectionIndicator className="custom-class" />);

      const indicator = screen.getByTitle('Connected');
      expect(indicator.className).toContain('custom-class');
    });
  });

  describe('connection states', () => {
    it('should show connected state correctly', () => {
      mockConnectionState = 'connected';
      render(<ConnectionIndicator showLabel />);

      expect(screen.getByText('Connected')).toBeInTheDocument();
      expect(screen.getByTitle('Connected')).toBeInTheDocument();
    });

    it('should show connecting state correctly', () => {
      mockConnectionState = 'connecting';
      render(<ConnectionIndicator showLabel />);

      expect(screen.getByText('Connecting...')).toBeInTheDocument();
      expect(screen.getByTitle('Connecting...')).toBeInTheDocument();
    });

    it('should show disconnected state correctly', () => {
      mockConnectionState = 'disconnected';
      render(<ConnectionIndicator showLabel />);

      expect(screen.getByText('Disconnected')).toBeInTheDocument();
      expect(screen.getByTitle('Disconnected')).toBeInTheDocument();
    });

    it('should show error state correctly', () => {
      mockConnectionState = 'error';
      render(<ConnectionIndicator showLabel />);

      expect(screen.getByText('Connection error')).toBeInTheDocument();
      expect(screen.getByTitle('Connection error')).toBeInTheDocument();
    });

    it('should show reconnect button only in error state', () => {
      // Connected - no button
      mockConnectionState = 'connected';
      const { rerender } = render(<ConnectionIndicator />);
      expect(screen.queryByTitle('Retry connection')).not.toBeInTheDocument();

      // Connecting - no button
      mockConnectionState = 'connecting';
      rerender(<ConnectionIndicator />);
      expect(screen.queryByTitle('Retry connection')).not.toBeInTheDocument();

      // Disconnected - no button
      mockConnectionState = 'disconnected';
      rerender(<ConnectionIndicator />);
      expect(screen.queryByTitle('Retry connection')).not.toBeInTheDocument();

      // Error - has button
      mockConnectionState = 'error';
      rerender(<ConnectionIndicator />);
      expect(screen.getByTitle('Retry connection')).toBeInTheDocument();
    });
  });

  describe('reconnect functionality', () => {
    it('should call reconnect when button is clicked', async () => {
      mockConnectionState = 'error';
      const user = userEvent.setup();

      render(<ConnectionIndicator />);

      const reconnectButton = screen.getByTitle('Retry connection');
      await user.click(reconnectButton);

      expect(mockReconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('sizes', () => {
    it('should render small size', () => {
      render(<ConnectionIndicator size="sm" />);
      // Component renders successfully
      expect(screen.getByTitle('Connected')).toBeInTheDocument();
    });

    it('should render medium size (default)', () => {
      render(<ConnectionIndicator />);
      expect(screen.getByTitle('Connected')).toBeInTheDocument();
    });

    it('should render large size', () => {
      render(<ConnectionIndicator size="lg" />);
      expect(screen.getByTitle('Connected')).toBeInTheDocument();
    });
  });
});
