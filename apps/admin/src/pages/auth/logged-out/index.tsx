import { Link } from 'react-router';
import { MetaData } from '@/components/atoms/MetaData';
import { Icon } from '@/components/atoms/Icon';

/**
 * Logged Out confirmation page.
 *
 * This page is shown after the user successfully logs out.
 * It does NOT auto-redirect to login, preventing the issue where
 * clearing local tokens but keeping the IdP session would immediately
 * log the user back in.
 *
 * The user must explicitly click "Sign in again" to start a new login flow.
 */
const LoggedOutPage = () => {
  return (
    <div data-testid="page-auth-logged-out">
      <MetaData title="Logged Out" />
      <div className="flex flex-col justify-center items-center bg-base-100 min-h-screen p-4">
        <div className="card bg-base-200 w-full max-w-md shadow-xl">
          <div className="card-body items-center text-center">
            <div className="mb-4">
              <Icon
                icon="lucide--log-out"
                className="size-16 text-success opacity-80"
              />
            </div>
            <h1 className="card-title text-2xl">You've been logged out</h1>
            <p className="text-base-content/70 mt-2">
              Your session has been ended successfully.
            </p>
            <div className="card-actions mt-6 w-full">
              <Link to="/auth/login" className="btn btn-primary w-full">
                <Icon icon="lucide--log-in" className="size-4" />
                Sign in again
              </Link>
            </div>
            <div className="mt-4">
              <Link
                to="/"
                className="link link-hover text-sm text-base-content/60"
              >
                Go to homepage
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoggedOutPage;
