import { Link } from 'react-router';

import { Logo } from '@/components';
import { Icon } from '@/components/atoms/Icon';

export const Footer = () => {
  return (
    <div
      className="group/section border-base-200 bg-neutral/1 scroll-mt-12 rounded-t-xl border-t pt-8 md:pt-12 lg:pt-16 2xl:pt-28"
      id="contact"
    >
      <div className="container">
        <div className="flex items-center justify-center gap-1.5">
          <div className="bg-primary/80 h-4 w-0.5 translate-x-1.5 rounded-full opacity-0 transition-all group-hover/section:translate-x-0 group-hover/section:opacity-100" />
          <p className="text-base-content/60 group-hover/section:text-primary font-mono text-sm font-medium transition-all">
            Stay Connected
          </p>
          <div className="bg-primary/80 h-4 w-0.5 -translate-x-1.5 rounded-full opacity-0 transition-all group-hover/section:translate-x-0 group-hover/section:opacity-100" />
        </div>
        <p className="mt-2 text-center text-2xl font-semibold sm:text-3xl">
          Stay Updated
        </p>
        <div className="mt-2 flex justify-center text-center">
          <p className="text-base-content/80 max-w-lg">
            Get the latest insights on knowledge management, AI-powered
            workflows, and feature updates delivered to your inbox
          </p>
        </div>
        <div className="mt-8 flex items-start justify-center gap-4">
          <div>
            <div className="input w-40 sm:w-64">
              <span className="iconify lucide--mail text-base-content/80 size-5"></span>
              <input name="email" placeholder="Email Address" type="email" />
            </div>
            <p className="text-base-content/60 mt-0.5 text-sm italic">
              Never spam!
            </p>
          </div>
          <button className="btn btn-primary">Subscribe</button>
        </div>
        <div className="mt-8 grid gap-6 md:mt-16 lg:grid-cols-2 xl:mt-24 2xl:mt-32">
          <div className="col-span-1">
            <div>
              <Link to="/">
                <Logo className="h-7.5" variant="two-tone-blue" />
              </Link>
              <p className="text-base-content/80 mt-4 max-w-sm leading-5">
                Transform your documents into living intelligence. Emergent
                automatically structures your knowledge, connects insights, and
                proactively surfaces what you need.
              </p>
              <div className="mt-6 flex items-center gap-3">
                <Link
                  to="#"
                  className="btn btn-ghost btn-square border-base-300 btn-sm max-w-full gap-3"
                  aria-label="GitHub"
                >
                  <Icon
                    icon="lucide--github"
                    className="size-5"
                    ariaLabel="GitHub"
                  />
                </Link>
                <Link
                  to="#"
                  className="btn btn-ghost btn-square border-base-300 btn-sm max-w-full gap-3"
                  aria-label="X"
                >
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
                <Link
                  to="#"
                  className="btn btn-ghost btn-square border-base-300 btn-sm max-w-full gap-3"
                  aria-label="LinkedIn"
                >
                  <Icon
                    icon="lucide--linkedin"
                    className="size-5"
                    ariaLabel="LinkedIn"
                  />
                </Link>
              </div>
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="text-lg font-medium">Product</h2>
              <div className="mt-2 flex flex-col gap-2">
                <a href="#features" className="hover:link-primary">
                  Features
                </a>
                <a href="#process" className="hover:link-primary">
                  How It Works
                </a>
                <a href="#benefits" className="hover:link-primary">
                  Benefits
                </a>
                <a href="#faq" className="hover:link-primary">
                  FAQ
                </a>
                <Link className="hover:link-primary" to="/admin">
                  Dashboard
                </Link>
              </div>
            </div>
            <div>
              <h2 className="text-lg font-medium">Resources</h2>
              <div className="mt-2 flex flex-col gap-2">
                <Link className="hover:link-primary" to="/admin/documents">
                  Documents
                </Link>
                <Link className="hover:link-primary" to="/admin/chat">
                  AI Chat
                </Link>
                <Link className="hover:link-primary" to="#">
                  Documentation
                </Link>
                <Link className="hover:link-primary" to="#">
                  Help Center
                </Link>
                <Link className="hover:link-primary" to="#">
                  Support
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
      <hr className="text-base-200 mt-8" />
      <div className="container flex flex-wrap items-center justify-between gap-2 py-4">
        <p>&copy; {new Date().getFullYear()} Emergent. All rights reserved.</p>
        <p className="text-base-content/60">
          Effortless Mastery of Your Domain
        </p>
        <div className="inline-flex items-center gap-4">
          <Link to="#" className="hover:link-primary link link-hover">
            Terms
          </Link>
          <Link to="#" className="hover:link-primary link link-hover">
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
};
