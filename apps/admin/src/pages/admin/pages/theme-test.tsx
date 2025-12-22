import { useState } from 'react';
import { ThemeEditor } from '@/components/organisms/ThemeEditor';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/atoms/Button';
import { Spinner } from '@/components/atoms/Spinner';

/**
 * Theme Testing Page
 *
 * This page provides a theme editor and live preview of theme colors
 * on actual UI components to help visualize color distribution.
 */
export default function ThemeTestPage() {
  const [showEditor, setShowEditor] = useState(true);

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Theme Editor</h1>
          <p className="text-base-content/70 mt-1">
            Edit theme variables and see live changes on components below
          </p>
        </div>
        <Button
          color="ghost"
          onClick={() => setShowEditor(!showEditor)}
          startIcon={
            <Icon icon={showEditor ? 'lucide--eye-off' : 'lucide--eye'} />
          }
        >
          {showEditor ? 'Hide' : 'Show'} Editor
        </Button>
      </div>

      {/* Theme Editor */}
      {showEditor && (
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <ThemeEditor />
          </div>
        </div>
      )}

      {/* Preview Section */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Component Preview</h2>

        {/* Buttons Preview */}
        <div className="card bg-base-200 shadow">
          <div className="card-body">
            <h3 className="card-title">Buttons</h3>
            <div className="flex flex-wrap gap-2">
              <Button color="primary">Primary</Button>
              <Button color="secondary">Secondary</Button>
              <Button color="accent">Accent</Button>
              <Button color="neutral">Neutral</Button>
              <Button color="info">Info</Button>
              <Button color="success">Success</Button>
              <Button color="warning">Warning</Button>
              <Button color="error">Error</Button>
              <Button color="ghost">Ghost</Button>
            </div>
          </div>
        </div>

        {/* Alerts Preview */}
        <div className="card bg-base-200 shadow">
          <div className="card-body">
            <h3 className="card-title">Alerts</h3>
            <div className="space-y-2">
              <div className="alert alert-info">
                <Icon icon="lucide--info" className="size-5" />
                <span>Info alert with primary colors</span>
              </div>
              <div className="alert alert-success">
                <Icon icon="lucide--check-circle" className="size-5" />
                <span>Success alert - operation completed</span>
              </div>
              <div className="alert alert-warning">
                <Icon icon="lucide--alert-triangle" className="size-5" />
                <span>Warning alert - please review</span>
              </div>
              <div className="alert alert-error">
                <Icon icon="lucide--x-circle" className="size-5" />
                <span>Error alert - something went wrong</span>
              </div>
            </div>
          </div>
        </div>

        {/* Badges Preview */}
        <div className="card bg-base-200 shadow">
          <div className="card-body">
            <h3 className="card-title">Badges</h3>
            <div className="flex flex-wrap gap-2">
              <div className="badge badge-primary">Primary</div>
              <div className="badge badge-secondary">Secondary</div>
              <div className="badge badge-accent">Accent</div>
              <div className="badge badge-neutral">Neutral</div>
              <div className="badge badge-info">Info</div>
              <div className="badge badge-success">Success</div>
              <div className="badge badge-warning">Warning</div>
              <div className="badge badge-error">Error</div>
              <div className="badge badge-ghost">Ghost</div>
            </div>
          </div>
        </div>

        {/* Base Colors Preview */}
        <div className="card bg-base-200 shadow">
          <div className="card-body">
            <h3 className="card-title">Base Colors</h3>
            <div className="space-y-2">
              <div className="p-4 bg-base-100 rounded-lg">
                <span className="font-mono text-sm">base-100</span>
                <p className="text-base-content">
                  Main background with content text
                </p>
              </div>
              <div className="p-4 bg-base-200 rounded-lg">
                <span className="font-mono text-sm">base-200</span>
                <p className="text-base-content">Slightly darker background</p>
              </div>
              <div className="p-4 bg-base-300 rounded-lg">
                <span className="font-mono text-sm">base-300</span>
                <p className="text-base-content">Even darker background</p>
              </div>
            </div>
          </div>
        </div>

        {/* Form Controls Preview */}
        <div className="card bg-base-200 shadow">
          <div className="card-body">
            <h3 className="card-title">Form Controls</h3>
            <div className="space-y-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Text Input</span>
                </label>
                <input
                  type="text"
                  placeholder="Type here..."
                  className="input input-bordered w-full max-w-xs"
                />
              </div>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Select</span>
                </label>
                <select className="select select-bordered w-full max-w-xs">
                  <option>Option 1</option>
                  <option>Option 2</option>
                  <option>Option 3</option>
                </select>
              </div>
              <div className="form-control">
                <label className="label cursor-pointer max-w-xs">
                  <span className="label-text">Checkbox</span>
                  <input type="checkbox" className="checkbox" />
                </label>
              </div>
              <div className="form-control">
                <label className="label cursor-pointer max-w-xs">
                  <span className="label-text">Toggle</span>
                  <input type="checkbox" className="toggle" />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Progress & Loading Preview */}
        <div className="card bg-base-200 shadow">
          <div className="card-body">
            <h3 className="card-title">Progress & Loading</h3>
            <div className="space-y-4">
              <progress
                className="progress progress-primary w-full"
                value="40"
                max="100"
              ></progress>
              <progress
                className="progress progress-accent w-full"
                value="70"
                max="100"
              ></progress>
              <div className="flex gap-4">
                <Spinner className="text-primary" />
                <Spinner className="text-secondary" />
                <Spinner className="text-accent" />
              </div>
            </div>
          </div>
        </div>

        {/* Stats Preview */}
        <div className="card bg-base-200 shadow">
          <div className="card-body">
            <h3 className="card-title">Stats</h3>
            <div className="stats shadow">
              <div className="stat">
                <div className="stat-figure text-primary">
                  <Icon icon="lucide--file-text" className="size-8" />
                </div>
                <div className="stat-title">Documents</div>
                <div className="stat-value text-primary">1,234</div>
                <div className="stat-desc">21% more than last month</div>
              </div>
              <div className="stat">
                <div className="stat-figure text-secondary">
                  <Icon icon="lucide--users" className="size-8" />
                </div>
                <div className="stat-title">Users</div>
                <div className="stat-value text-secondary">567</div>
                <div className="stat-desc">12% increase</div>
              </div>
              <div className="stat">
                <div className="stat-figure text-accent">
                  <Icon icon="lucide--zap" className="size-8" />
                </div>
                <div className="stat-title">Active</div>
                <div className="stat-value text-accent">89</div>
                <div className="stat-desc">Currently online</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
