import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ToastContainer } from './ToastContainer';
import { ToastProvider, useToast } from '../../../contexts/toast';

// Helper component to trigger toasts interactively
function ToastDemo() {
  const { showToast } = useToast();

  return (
    <div className="flex flex-col gap-4 p-8">
      <h2 className="text-2xl font-bold mb-4">Toast Notifications Demo</h2>

      <div className="card bg-base-100 shadow-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Basic Variants</h3>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-success"
            onClick={() =>
              showToast({
                message: 'Operation completed successfully!',
                variant: 'success',
              })
            }
          >
            Show Success
          </button>

          <button
            className="btn btn-error"
            onClick={() =>
              showToast({
                message: 'An error occurred while processing your request.',
                variant: 'error',
              })
            }
          >
            Show Error
          </button>

          <button
            className="btn btn-warning"
            onClick={() =>
              showToast({
                message: 'Please review this important information.',
                variant: 'warning',
              })
            }
          >
            Show Warning
          </button>

          <button
            className="btn btn-info"
            onClick={() =>
              showToast({
                message: 'Here is some helpful information for you.',
                variant: 'info',
              })
            }
          >
            Show Info
          </button>
        </div>
      </div>

      <div className="card bg-base-100 shadow-xl p-6">
        <h3 className="text-lg font-semibold mb-4">With Actions</h3>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            onClick={() =>
              showToast({
                message: 'File deleted successfully.',
                variant: 'success',
                actions: [
                  {
                    label: 'Undo',
                    onClick: () => {
                      console.log('Undo clicked');
                      showToast({
                        message: 'Action undone',
                        variant: 'info',
                        duration: 2000,
                      });
                    },
                  },
                ],
              })
            }
          >
            Delete with Undo
          </button>

          <button
            className="btn btn-secondary"
            onClick={() =>
              showToast({
                message: 'New message received from John Doe.',
                variant: 'info',
                duration: null, // Manual dismiss only
                actions: [
                  {
                    label: 'View',
                    onClick: () => console.log('View clicked'),
                  },
                  {
                    label: 'Reply',
                    onClick: () => console.log('Reply clicked'),
                  },
                ],
              })
            }
          >
            Message (Manual Dismiss)
          </button>
        </div>
      </div>

      <div className="card bg-base-100 shadow-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Duration Control</h3>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-ghost"
            onClick={() =>
              showToast({
                message: 'This toast will dismiss in 2 seconds.',
                variant: 'info',
                duration: 2000,
              })
            }
          >
            Quick Toast (2s)
          </button>

          <button
            className="btn btn-ghost"
            onClick={() =>
              showToast({
                message: 'This toast stays until you dismiss it.',
                variant: 'warning',
                duration: null,
              })
            }
          >
            Persistent Toast
          </button>

          <button
            className="btn btn-ghost"
            onClick={() =>
              showToast({
                message: 'This toast uses the default duration (5s).',
                variant: 'success',
              })
            }
          >
            Default Duration (5s)
          </button>
        </div>
      </div>

      <div className="card bg-base-100 shadow-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Toast Stacking</h3>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-accent"
            onClick={() => {
              for (let i = 1; i <= 3; i++) {
                showToast({
                  message: `Toast notification #${i}`,
                  variant: 'info',
                  duration: null,
                });
              }
            }}
          >
            Add 3 Toasts
          </button>

          <button
            className="btn btn-accent"
            onClick={() => {
              for (let i = 1; i <= 7; i++) {
                showToast({
                  message: `Toast #${i} (Max 5 will be shown)`,
                  variant: 'success',
                  duration: null,
                });
              }
            }}
          >
            Test Max Limit (7 toasts)
          </button>
        </div>
      </div>

      <div className="card bg-base-100 shadow-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Real-world Examples</h3>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            onClick={() =>
              showToast({
                message: 'Document uploaded successfully',
                variant: 'success',
                duration: 3000,
              })
            }
          >
            Document Upload
          </button>

          <button
            className="btn btn-primary"
            onClick={() =>
              showToast({
                message: 'Switched to "Acme Corp"',
                variant: 'success',
                duration: 2500,
              })
            }
          >
            Organization Switch
          </button>

          <button
            className="btn btn-primary"
            onClick={() =>
              showToast({
                message: 'KB purpose saved successfully',
                variant: 'success',
                duration: 3000,
              })
            }
          >
            Save Confirmation
          </button>

          <button
            className="btn btn-error"
            onClick={() =>
              showToast({
                message: 'Failed to connect to server. Please try again.',
                variant: 'error',
                duration: 5000,
              })
            }
          >
            Network Error
          </button>
        </div>
      </div>
    </div>
  );
}

const meta: Meta<typeof ToastContainer> = {
  title: 'Organisms/ToastContainer',
  component: ToastContainer,
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof ToastContainer>;

/**
 * Interactive demo showing all toast variants and features.
 * Click the buttons to trigger different types of toast notifications.
 */
export const InteractiveDemo: Story = {
  render: () => (
    <>
      <ToastDemo />
      <ToastContainer />
    </>
  ),
};

/**
 * Success toast with default 5s auto-dismiss.
 */
export const Success: Story = {
  render: () => {
    const TriggerSuccess = () => {
      const { showToast } = useToast();
      React.useEffect(() => {
        showToast({
          message: 'Operation completed successfully!',
          variant: 'success',
        });
      }, [showToast]);
      return null;
    };

    return (
      <>
        <TriggerSuccess />
        <ToastContainer />
      </>
    );
  },
};

/**
 * Error toast for displaying error messages.
 */
export const Error: Story = {
  render: () => {
    const TriggerError = () => {
      const { showToast } = useToast();
      React.useEffect(() => {
        showToast({
          message: 'An error occurred while processing your request.',
          variant: 'error',
        });
      }, [showToast]);
      return null;
    };

    return (
      <>
        <TriggerError />
        <ToastContainer />
      </>
    );
  },
};

/**
 * Warning toast for important alerts.
 */
export const Warning: Story = {
  render: () => {
    const TriggerWarning = () => {
      const { showToast } = useToast();
      React.useEffect(() => {
        showToast({
          message: 'Please review this important information.',
          variant: 'warning',
        });
      }, [showToast]);
      return null;
    };

    return (
      <>
        <TriggerWarning />
        <ToastContainer />
      </>
    );
  },
};

/**
 * Info toast for general information.
 */
export const Info: Story = {
  render: () => {
    const TriggerInfo = () => {
      const { showToast } = useToast();
      React.useEffect(() => {
        showToast({
          message: 'Here is some helpful information for you.',
          variant: 'info',
        });
      }, [showToast]);
      return null;
    };

    return (
      <>
        <TriggerInfo />
        <ToastContainer />
      </>
    );
  },
};

/**
 * Toast with action buttons for interactive notifications.
 */
export const WithActions: Story = {
  render: () => {
    const TriggerWithActions = () => {
      const { showToast } = useToast();
      React.useEffect(() => {
        showToast({
          message: 'File deleted successfully.',
          variant: 'success',
          actions: [
            {
              label: 'Undo',
              onClick: () => console.log('Undo clicked'),
            },
            {
              label: 'View',
              onClick: () => console.log('View clicked'),
            },
          ],
        });
      }, [showToast]);
      return null;
    };

    return (
      <>
        <TriggerWithActions />
        <ToastContainer />
      </>
    );
  },
};

/**
 * Multiple toasts stacked together (max 5 visible).
 */
export const MultipleToasts: Story = {
  render: () => {
    const TriggerMultiple = () => {
      const { showToast } = useToast();
      React.useEffect(() => {
        showToast({
          message: 'First notification',
          variant: 'success',
          duration: null,
        });
        showToast({
          message: 'Second notification',
          variant: 'info',
          duration: null,
        });
        showToast({
          message: 'Third notification',
          variant: 'warning',
          duration: null,
        });
      }, [showToast]);
      return null;
    };

    return (
      <>
        <TriggerMultiple />
        <ToastContainer />
      </>
    );
  },
};

/**
 * Toast that requires manual dismissal (duration: null).
 */
export const PersistentToast: Story = {
  render: () => {
    const TriggerPersistent = () => {
      const { showToast } = useToast();
      React.useEffect(() => {
        showToast({
          message: 'This toast will not auto-dismiss. Click X to close.',
          variant: 'warning',
          duration: null,
        });
      }, [showToast]);
      return null;
    };

    return (
      <>
        <TriggerPersistent />
        <ToastContainer />
      </>
    );
  },
};
