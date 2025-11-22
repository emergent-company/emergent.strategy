import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';

import { Logo, ThemeToggle } from '@/components';

const menu = [
  {
    title: 'Home',
    href: '#hero',
  },
  {
    title: 'Features',
    href: '#features',
  },
  {
    title: 'How It Works',
    href: '#process',
  },
  {
    title: 'Benefits',
    href: '#benefits',
  },
  {
    title: 'FAQ',
    href: '#faq',
  },
] as const;

export const Topbar = () => {
  const [scrollPosition, setScrollPosition] = useState<number>(0);

  const handleScroll = useCallback(() => {
    setScrollPosition(window.scrollY);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  return (
    <div
      className="group fixed start-0 end-0 top-0 z-10 flex justify-center md:top-4"
      data-at-top={scrollPosition < 30}
    >
      <div className="md:bg-base-100 bg-base-100/90 flex h-16 items-center gap-20 px-4 backdrop-blur-xs transition-all duration-500 group-data-[at-top=false]:shadow group-data-[at-top=true]:bg-transparent hover:group-data-[at-top=false]:shadow-lg max-md:grow max-md:justify-between md:rounded-full md:px-8">
        <div className="flex items-center gap-2">
          <div className="md:hidden">
            <div className="drawer">
              <input
                id="navigation-drawer"
                type="checkbox"
                className="drawer-toggle"
              />
              <div className="drawer-content">
                <label
                  htmlFor="navigation-drawer"
                  className="btn btn-sm btn-ghost btn-square drawer-button"
                >
                  <span className="iconify lucide--menu size-5"></span>
                </label>
              </div>
              <div className="drawer-side">
                <label
                  htmlFor="navigation-drawer"
                  aria-label="close sidebar"
                  className="drawer-overlay"
                ></label>
                <div className="bg-base-100 flex h-screen w-60 flex-col px-3 py-4">
                  <div className="flex justify-center">
                    <Link to="/">
                      <Logo variant="two-tone-blue" />
                    </Link>
                  </div>
                  <div className="min-h-0 grow">
                    <div className="mt-5 size-full">
                      <p className="text-base-content/60 mx-3 text-sm font-medium">
                        Navigation
                      </p>
                      <ul className="menu mt-1 w-full p-0">
                        {menu.map((item, index) => (
                          <li key={index}>
                            <a
                              href={item.href ?? ''}
                              className="hover:bg-base-200 rounded-box block px-3 py-1.5 text-sm"
                            >
                              {item.title}
                            </a>
                          </li>
                        ))}
                        <li>
                          <Link
                            to="/admin"
                            className="hover:bg-base-200 rounded-box block px-3 py-1.5 text-sm"
                          >
                            Dashboard
                          </Link>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <Link to="/">
            <Logo variant="two-tone-blue" />
          </Link>
        </div>
        <div className="hidden items-center gap-1 md:flex">
          {menu.map((item, index) => (
            <a
              href={item.href ?? ''}
              className="hover:bg-base-200 rounded-box block px-3 py-1.5 text-sm"
              key={index}
            >
              {item.title}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle className="btn btn-sm btn-ghost btn-circle" />
          <Link to="/admin" className="btn btn-primary btn-sm max-md:hidden">
            Get Started
          </Link>
        </div>
      </div>
    </div>
  );
};
