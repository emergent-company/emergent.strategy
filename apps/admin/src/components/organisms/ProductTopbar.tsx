import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
// @ts-ignore
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';

import { Logo } from '@/components/atoms/Logo';

const productMenu = [
  {
    title: 'emergent.core',
    href: '/emergent-core',
    description: 'Knowledge infrastructure',
    layer: 'Infrastructure Layer',
  },
  {
    title: 'emergent.automator',
    href: '/automation',
    description: 'Workflow automation',
    layer: 'Solution Layer',
  },
  {
    title: 'emergent.product',
    href: '/product-framework',
    description: 'Living product bible',
    layer: 'Solution Layer',
  },
  // Add more products here as they're built
];

// Group products by layer
const groupedProducts = productMenu.reduce((acc, product) => {
  const layer = product.layer;
  if (!acc[layer]) {
    acc[layer] = [];
  }
  acc[layer].push(product);
  return acc;
}, {} as Record<string, typeof productMenu>);

const layers = Object.keys(groupedProducts);

const mainMenu = [
  {
    title: 'Vision',
    href: '/',
  },
  {
    title: 'Products',
    type: 'dropdown' as const,
    items: productMenu,
  },
];

export const ProductTopbar = () => {
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
      <div className="bg-base-100/60 flex h-16 items-center gap-8 px-4 backdrop-blur-md transition-all duration-500 group-data-[at-top=false]:shadow group-data-[at-top=true]:bg-transparent hover:group-data-[at-top=false]:shadow-lg max-md:grow max-md:justify-between md:rounded-full md:px-12 md:gap-12 border border-base-content/10">
        {/* Logo */}
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
                      <Logo />
                    </Link>
                  </div>
                  <div className="min-h-0 grow">
                    <SimpleBar className="mt-5 size-full">
                      <p className="text-base-content/60 mx-3 text-sm font-medium">
                        Navigation
                      </p>
                      <ul className="menu mt-1 w-full p-0">
                        {mainMenu.map((item, index) =>
                          item.type === 'dropdown' ? (
                            <li key={index}>
                              <details>
                                <summary className="hover:bg-base-200 rounded-box px-3 py-1.5 text-sm">
                                  {item.title}
                                </summary>
                                <ul>
                                  {layers.map((layer, layerIndex) => (
                                    <div key={layerIndex}>
                                      <div className="text-xs text-base-content/60 font-semibold uppercase px-3 py-2">
                                        {layer}
                                      </div>
                                      {groupedProducts[layer].map(
                                        (subItem, subIndex) => (
                                          <li key={subIndex}>
                                            <Link
                                              to={subItem.href}
                                              className="hover:bg-base-200 rounded-box block px-3 py-1.5 text-sm"
                                            >
                                              <div>
                                                <p className="font-medium">
                                                  {subItem.title}
                                                </p>
                                                <p className="text-base-content/60 text-xs">
                                                  {subItem.description}
                                                </p>
                                              </div>
                                            </Link>
                                          </li>
                                        )
                                      )}
                                    </div>
                                  ))}
                                </ul>
                              </details>
                            </li>
                          ) : (
                            <li key={index}>
                              <Link
                                to={item.href ?? ''}
                                className="hover:bg-base-200 rounded-box block px-3 py-1.5 text-sm"
                              >
                                {item.title}
                              </Link>
                            </li>
                          )
                        )}
                      </ul>

                      <div className="divider mx-3"></div>

                      <Link
                        to="/admin"
                        className="btn btn-primary btn-sm mx-3 gap-2"
                      >
                        <span className="iconify lucide--layout-dashboard size-4"></span>
                        Dashboard
                      </Link>
                    </SimpleBar>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <Link to="/">
            <Logo />
          </Link>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden items-center gap-2 md:flex">
          {mainMenu.map((item, index) =>
            item.type === 'dropdown' ? (
              <div className="dropdown" key={index}>
                <div
                  tabIndex={0}
                  role="button"
                  className="hover:bg-base-200 rounded-box flex items-center gap-1 px-3 py-1.5 text-sm"
                >
                  {item.title}
                  <span className="iconify lucide--chevron-down size-3.5"></span>
                </div>
                <ul
                  tabIndex={-1}
                  className="dropdown-content menu bg-base-100 rounded-box z-[1] mt-2 w-64 border border-base-300 p-2 shadow"
                >
                  {layers.map((layer, layerIndex) => (
                    <div key={layerIndex}>
                      {layerIndex > 0 && <div className="divider my-1"></div>}
                      <div className="text-xs text-base-content/60 font-semibold uppercase px-3 py-2">
                        {layer}
                      </div>
                      {groupedProducts[layer].map((subItem, subIndex) => (
                        <li key={subIndex}>
                          <Link
                            to={subItem.href}
                            className="hover:bg-base-200 rounded-box block px-3 py-2"
                          >
                            <div>
                              <p className="font-medium">{subItem.title}</p>
                              <p className="text-base-content/60 text-xs">
                                {subItem.description}
                              </p>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </div>
                  ))}
                </ul>
              </div>
            ) : (
              <Link
                to={item.href ?? ''}
                className="hover:bg-base-200 rounded-box block px-3 py-1.5 text-sm"
                key={index}
              >
                {item.title}
              </Link>
            )
          )}
        </div>

        {/* Right side: Dashboard button */}
        <div className="flex items-center gap-2 ml-8">
          <Link
            to="/admin"
            className="btn btn-primary btn-sm gap-2 max-md:btn-circle max-md:btn-ghost"
          >
            <span className="iconify lucide--layout-dashboard size-4"></span>
            <span className="max-md:hidden">Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
