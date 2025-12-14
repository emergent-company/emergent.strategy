import { Link } from 'react-router';

import { Logo } from '@/components';
import { Icon } from '@/components/atoms/Icon';
import { ThemePicker } from '@/components/molecules/ThemePicker';

export const Footer = () => {
  return (
    <div className="relative">
      <div className="z-0 absolute inset-0 opacity-20 grainy"></div>

      <div className="z-[2] relative pt-8 md:pt-12 2xl:pt-24 xl:pt-16 container">
        <div className="gap-6 grid grid-cols-2 md:grid-cols-5">
          <div className="col-span-2">
            <Logo />

            <p className="mt-3 max-sm:text-sm text-base-content/80">
              Transform your documents into living intelligence. Emergent
              automatically structures your knowledge, connects insights, and
              proactively surfaces what you need.
            </p>
            <div className="flex items-center gap-2.5 mt-6 xl:mt-16">
              <Link className="btn btn-sm btn-circle" to="#" target="_blank">
                <Icon
                  icon="lucide--github"
                  className="size-4"
                  ariaLabel="GitHub"
                />
              </Link>
              <Link className="btn btn-sm btn-circle" to="#" target="_blank">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  className="size-4"
                >
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.7"
                    d="m3 21l7.548-7.548M21 3l-7.548 7.548m0 0L8 3H3l7.548 10.452m2.904-2.904L21 21h-5l-5.452-7.548"
                    color="currentColor"
                  />
                </svg>
              </Link>
              <Link to="#" className="btn btn-sm btn-circle">
                <Icon
                  icon="lucide--linkedin"
                  className="size-4"
                  ariaLabel="LinkedIn"
                />
              </Link>
            </div>
          </div>
          <div className="max-md:hidden xl:col-span-1"></div>
          <div className="col-span-1">
            <p className="font-medium">Product</p>
            <div className="flex flex-col space-y-1.5 mt-5 text-base-content/80 *:hover:text-base-content *:cursor-pointer">
              <Link to="/">Vision</Link>
              <Link to="/emergent-core">emergent.core</Link>
              <Link to="/automation">emergent.automator</Link>
              <Link to="/admin">Dashboard</Link>
            </div>
          </div>
          <div className="col-span-1">
            <p className="font-medium">Resources</p>
            <div className="flex flex-col space-y-1.5 mt-5 text-base-content/80 *:hover:text-base-content *:cursor-pointer">
              <Link to="/admin/documents">Documents</Link>
              <Link to="/admin/chat-sdk">Chat</Link>
              <Link to="#">Documentation</Link>
              <Link to="#">Help Center</Link>
              <Link to="#">Support</Link>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-between items-center gap-3 mt-12 py-6 border-t border-base-300">
          <p>
            &copy; {new Date().getFullYear()} Emergent. All rights reserved.
          </p>
          <ThemePicker />
        </div>
      </div>

      <p className="max-lg:hidden flex justify-center -mt-12 h-[195px] overflow-hidden font-black text-[200px] text-base-content/5 tracking-[12px] whitespace-nowrap select-none">
        EMERGENT
      </p>
    </div>
  );
};
