import { Icon } from '@/components/atoms/Icon';
import { Link } from 'react-router';

export const BundleOffer = () => {
  return (
    <div
      className="pt-8 md:pt-12 2xl:pt-24 xl:pt-16 pb-12 md:pb-18 2xl:pb-36 xl:pb-24 container"
      id="bundle"
    >
      <div className="text-center">
        <div className="inline-flex items-center bg-purple-500/5 p-2 border border-purple-500/10 rounded-box text-purple-500">
          <Icon
            icon="lucide--package-search"
            className="size-5"
            ariaLabel="Bundle"
          />
        </div>
        <p className="mt-4 font-semibold text-2xl sm:text-3xl">
          The Powerful Admin & Startup Solution
        </p>
        <p className="inline-block mt-3 max-w-lg max-sm:text-sm text-base-content/70">
          Accelerate your projects with a flexible dashboard and landing
          template designed for startup growth and business success.
        </p>
      </div>
      <div className="gap-6 grid lg:grid-cols-2 mt-8 lg:mt-16">
        <Link
          to="https://daisyui.com/store/475050/"
          className="bg-base-100 p-6 border border-base-300 rounded-md h-fit"
          target="_blank"
        >
          <p className="font-medium text-base-content/60 italic">
            Looking for <span className="underline">Startup</span>
          </p>
          <div className="mt-5">
            <img
              src="/images/landing/scalo-logo-light.svg"
              className="dark:hidden h-6.5"
              alt="Scalo"
            />
            <img
              src="/images/landing/scalo-logo-dark.svg"
              className="hidden dark:inline h-6.5"
              alt="Scalo"
            />
          </div>
          <p className="mt-5 text-base-content/70">
            Scalo and Emergent make your admin dashboard feel less like work and
            more like launching your next big thing. Smart, fast, focused, and
            beautifully built for startups.
          </p>
          <div className="flex justify-center">
            <button className="gap-3 mt-5 text-base btn btn-primary">
              <Icon
                icon="lucide--plane-takeoff"
                className="size-4 sm:size-5"
                aria-hidden
              />
              Get Scalo
            </button>
          </div>
        </Link>
        <Link
          className="group bg-linear-to-br from-primary to-secondary p-0.5 rounded-md h-fit"
          to="https://daisyui.com/store/244268/"
          target="_blank"
        >
          <div className="bg-base-100 rounded-box">
            <div className="relative bg-linear-to-br from-primary/5 group-hover:from-primary/10 to-secondary/5 group-hover:to-secondary/10 p-6 transition-all">
              <p className="font-medium text-base-content/60 italic">
                Bundle Offer
              </p>
              <div className="flex items-center gap-4 mt-5">
                <img
                  src="/images/logo/logo-light.svg"
                  className="dark:hidden h-5"
                  alt="Scalo"
                />
                <img
                  src="/images/logo/logo-dark.svg"
                  className="hidden dark:inline h-5"
                  alt="Scalo"
                />
                <Icon
                  icon="lucide--plus"
                  className="size-5 text-base-content/50"
                  aria-hidden
                />
                <img
                  src="/images/landing/scalo-logo-light.svg"
                  className="dark:hidden h-6.5"
                  alt="Scalo"
                />
                <img
                  src="/images/landing/scalo-logo-dark.svg"
                  className="hidden dark:inline h-6.5"
                  alt="Scalo"
                />
              </div>
              <p className="mt-4 text-base-content/80">
                Get{' '}
                <span className="font-semibold text-primary">
                  Emergent Dashboard
                </span>{' '}
                and{' '}
                <span className="font-semibold text-secondary">
                  Scalo Startup Template
                </span>{' '}
                together at a discounted price. The perfect combo for building
                and managing modern web projects effortlessly.
              </p>
              <div className="flex justify-center mt-5">
                <button className="gap-3 bg-linear-to-br from-primary to-secondary shadow-inner shadow-primary-content/20 border-0 text-primary-content text-base btn">
                  <Icon
                    icon="lucide--package"
                    className="size-4 sm:size-5"
                    aria-hidden
                  />
                  Get Bundle
                </button>
              </div>
              <p className="top-4 absolute font-medium text-orange-600 dark:text-orange-400 end-4">
                Special Discount
              </p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
};
