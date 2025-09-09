import { type ReactNode } from "react";

// Simplified auth layout: remove marketing hero / testimonial image for a cleaner, faster login.
// Full-width on all breakpoints; centers content for better focus and to avoid layout shift after OIDC redirects.
const AuthLayout = ({ children }: { children: ReactNode }) => {
    return (
        <div className="flex justify-center items-center p-4 min-h-screen">
            <div className="w-full max-w-md">{children}</div>
        </div>
    );
};

export default AuthLayout;
