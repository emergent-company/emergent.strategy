import type { Meta, StoryObj } from '@storybook/react';
import { FormField } from './FormField';

const meta: Meta<typeof FormField> = {
  title: 'Molecules/FormField',
  component: FormField,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    inputSize: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg'],
    },
    inputColor: {
      control: 'select',
      options: [
        'primary',
        'secondary',
        'accent',
        'info',
        'success',
        'warning',
        'error',
      ],
    },
  },
};

export default meta;
type Story = StoryObj<typeof FormField>;

export const Default: Story = {
  args: {
    placeholder: 'Type here',
    type: 'text',
  },
  render: (args) => (
    <div className="w-full max-w-xs">
      <FormField {...args} />
    </div>
  ),
};

export const WithLabel: Story = {
  args: {
    label: 'What is your name?',
    placeholder: 'Enter your name',
    type: 'text',
  },
  render: (args) => (
    <div className="w-full max-w-xs">
      <FormField {...args} />
    </div>
  ),
};

export const WithDescription: Story = {
  args: {
    label: 'Email Address',
    type: 'email',
    placeholder: 'Enter your email',
    description: "We'll never share your email",
  },
  render: (args) => (
    <div className="w-full max-w-xs">
      <FormField {...args} />
    </div>
  ),
};

export const WithAltLabels: Story = {
  args: {
    label: 'Full Name',
    labelAlt: 'Required',
    type: 'text',
    placeholder: 'John Doe',
    description: 'Your display name',
    descriptionAlt: '0/100',
  },
  render: (args) => (
    <div className="w-full max-w-xs">
      <FormField {...args} />
    </div>
  ),
};

export const Required: Story = {
  args: {
    label: 'Username',
    type: 'text',
    placeholder: 'Enter username',
    required: true,
  },
  render: (args) => (
    <div className="w-full max-w-xs">
      <FormField {...args} />
    </div>
  ),
};

export const WithError: Story = {
  args: {
    label: 'Email Address',
    type: 'email',
    placeholder: 'Enter your email',
    error: 'Invalid email format',
    defaultValue: 'not-an-email',
  },
  render: (args) => (
    <div className="w-full max-w-xs">
      <FormField {...args} />
    </div>
  ),
};

export const WithSuccess: Story = {
  args: {
    label: 'Username',
    type: 'text',
    placeholder: 'Choose username',
    success: 'Username is available!',
    defaultValue: 'john_doe_123',
  },
  render: (args) => (
    <div className="w-full max-w-xs">
      <FormField {...args} />
    </div>
  ),
};

export const WithWarning: Story = {
  args: {
    label: 'Password',
    type: 'password',
    placeholder: 'Enter password',
    warning: 'Password strength: Weak',
    defaultValue: '12345',
  },
  render: (args) => (
    <div className="w-full max-w-xs">
      <FormField {...args} />
    </div>
  ),
};

export const WithIcons: Story = {
  args: {
    label: 'Search',
    type: 'text',
    placeholder: 'Search...',
    leftIcon: 'lucide--search',
    rightIcon: 'lucide--x',
  },
  render: (args) => (
    <div className="w-full max-w-xs">
      <FormField {...args} />
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Field',
    type: 'text',
    placeholder: 'Cannot edit',
    disabled: true,
    defaultValue: 'Disabled value',
  },
  render: (args) => (
    <div className="w-full max-w-xs">
      <FormField {...args} />
    </div>
  ),
};

export const ReadOnly: Story = {
  args: {
    label: 'Email (Managed)',
    type: 'email',
    readOnly: true,
    defaultValue: 'user@example.com',
    description: 'Managed by identity provider',
  },
  render: (args) => (
    <div className="w-full max-w-xs">
      <FormField {...args} />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="space-y-4 w-full max-w-xs">
      <FormField label="Extra Small" inputSize="xs" placeholder="xs size" />
      <FormField label="Small" inputSize="sm" placeholder="sm size" />
      <FormField
        label="Medium (Default)"
        inputSize="md"
        placeholder="md size"
      />
      <FormField label="Large" inputSize="lg" placeholder="lg size" />
    </div>
  ),
};

export const Colors: Story = {
  render: () => (
    <div className="space-y-4 w-full max-w-xs">
      <FormField
        label="Primary"
        inputColor="primary"
        placeholder="Primary color"
      />
      <FormField
        label="Secondary"
        inputColor="secondary"
        placeholder="Secondary color"
      />
      <FormField
        label="Accent"
        inputColor="accent"
        placeholder="Accent color"
      />
      <FormField label="Info" inputColor="info" placeholder="Info color" />
      <FormField
        label="Success"
        inputColor="success"
        placeholder="Success color"
      />
      <FormField
        label="Warning"
        inputColor="warning"
        placeholder="Warning color"
      />
      <FormField label="Error" inputColor="error" placeholder="Error color" />
    </div>
  ),
};

export const FormExample: Story = {
  render: () => (
    <form className="space-y-4 w-full max-w-md p-6 bg-base-200 rounded-lg">
      <h2 className="text-xl font-bold mb-4">User Registration</h2>

      <FormField label="First Name" type="text" placeholder="John" required />

      <FormField label="Last Name" type="text" placeholder="Doe" required />

      <FormField
        label="Email Address"
        labelAlt="Required"
        type="email"
        placeholder="john@example.com"
        description="We'll send a verification email"
        leftIcon="lucide--mail"
        required
      />

      <FormField
        label="Phone Number"
        type="tel"
        placeholder="+1 (555) 000-0000"
        description="International format"
        descriptionAlt="Optional"
        leftIcon="lucide--phone"
      />

      <FormField
        label="Password"
        type="password"
        placeholder="Enter secure password"
        description="Minimum 8 characters"
        leftIcon="lucide--lock"
        required
      />

      <div className="flex justify-end gap-2 mt-6">
        <button type="button" className="btn btn-ghost">
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Register
        </button>
      </div>
    </form>
  ),
};
