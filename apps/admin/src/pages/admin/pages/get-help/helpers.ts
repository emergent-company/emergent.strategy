import { IHelpTopic } from "./HelpTopic";

export type IFAQs = {
    question: string;
    answer: string;
};

export const helpTopics: IHelpTopic[] = [
    {
        title: "Getting Started",
        description: "Learn how to set up your account and navigate the dashboard.",
    },
    {
        title: "User Management",
        description: "Manage user roles, permissions, and access control settings.",
    },
    {
        title: "Customization",
        description: "Adjust settings, themes, and preferences to personalize your experience.",
    },
    {
        title: "Integrations",
        description: "Connect with third-party services and APIs to extend functionality.",
    },
    {
        title: "Troubleshooting",
        description: "Find solutions to common issues and errors encountered in the system.",
    },
    {
        title: "Billing & Subscription",
        description: "Understand pricing plans, payment methods, and subscription management.",
    },
    {
        title: "Security & Privacy",
        description: "Learn about security best practices and how your data is protected.",
    },
    {
        title: "Reports & Analytics",
        description: "Generate and analyze reports to track system performance and insights.",
    },
];

export const getUserManagementFAQs: IFAQs[] = [
    {
        question: "How do I add a new user?",
        answer: "Go to the 'User Management' section, click 'Add User', fill in the required details, and submit.",
    },
    {
        question: "How can I change a user's role?",
        answer: "Navigate to 'User Management', select the user, click 'Edit', and update their role before saving.",
    },
    {
        question: "Can I deactivate a user instead of deleting them?",
        answer: "Yes, you can disable a user account by setting their status to 'Inactive' in the user settings.",
    },
    {
        question: "How do I reset a user's password?",
        answer: "Admins can reset passwords by selecting the user in 'User Management' and clicking 'Reset Password'. An email will be sent to the user.",
    },
];

export const getSystemFAQs: IFAQs[] = [
    {
        question: "Where can I update the system settings?",
        answer: "Navigate to the 'Settings' section in the admin panel to configure system preferences, security options, and more.",
    },
    {
        question: "How do I enable or disable maintenance mode?",
        answer: "Go to 'Settings' > 'System Configuration' and toggle the maintenance mode option to enable or disable it.",
    },
    {
        question: "Can I change the default timezone for the system?",
        answer: "Yes, you can update the system timezone in 'Settings' under 'General Preferences'.",
    },
    {
        question: "How do I configure email notifications?",
        answer: "Navigate to 'Settings' > 'Email Configuration' to set up SMTP settings and customize notification templates.",
    },
];
