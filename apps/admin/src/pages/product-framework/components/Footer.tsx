import { Link } from 'react-router';

import { Logo } from '@/components';
import { Icon } from '@/components/atoms/Icon';
import { ThemePicker } from '@/components/molecules/ThemePicker';

export const Footer = () => {
  return (
    <div className="relative">
      <div className="absolute inset-0 z-0 opacity-20 grainy"></div>

      <div className="container relative z-[2] pt-8 md:pt-12 xl:pt-16 2xl:pt-24">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-5">
          <div className="col-span-2">
            <Logo />

            <p className="text-base-content/80 mt-3 max-sm:text-sm">
              Navigate product uncertainty with strategic clarity. A living
              knowledge graph that connects intent to execution, learning to
              adaptation.
            </p>
            <div className="mt-6 flex items-center gap-2.5 xl:mt-16">
              <Link className="btn btn-circle btn-sm" to="#" target="_blank">
                <Icon
                  icon="lucide--github"
                  className="size-4"
                  ariaLabel="GitHub"
                />
              </Link>
              <Link className="btn btn-circle btn-sm" to="#" target="_blank">
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
              <Link to="#" className="btn btn-circle btn-sm">
                <Icon
                  icon="lucide--linkedin"
                  className="size-4"
                  ariaLabel="LinkedIn"
                />
              </Link>
            </div>
          </div>
          <div className="xl:col-span-1 max-md:hidden"></div>
          <div className="col-span-1">
            <p className="font-medium">Product</p>
            <div className="text-base-content/80 *:hover:text-base-content mt-5 flex flex-col space-y-1.5 *:cursor-pointer">
              <Link to="/">Vision</Link>
              <Link to="/emergent-core">emergent.core</Link>
              <Link to="/product-framework">emergent.product</Link>
              <Link to="/admin">Dashboard</Link>
            </div>
          </div>
          <div className="col-span-1">
            <p className="font-medium">Resources</p>
            <div className="text-base-content/80 *:hover:text-base-content mt-5 flex flex-col space-y-1.5 *:cursor-pointer">
              <Link to="/admin/documents">Documents</Link>
              <Link to="/admin/chat-sdk">Chat</Link>
              <Link to="#">Documentation</Link>
              <Link to="#">Help Center</Link>
              <Link to="#">Support</Link>
            </div>
          </div>
        </div>
        <div className="border-base-300 mt-12 flex flex-wrap items-center justify-between gap-3 border-t py-6">
          <p>
            &copy; {new Date().getFullYear()} Emergent. All rights reserved.
          </p>
          <ThemePicker />
        </div>
      </div>

      <p className="text-base-content/5 -mt-12 flex h-[195px] justify-center overflow-hidden whitespace-nowrap text-[200px] font-black tracking-[12px] select-none max-lg:hidden">
        EMERGENT
      </p>
    </div>
  );
};
