import { Link } from 'react-router';
import { Icon } from '@/components/atoms/Icon';

export const CTA = () => {
  return (
    <div className="sm:px-16 container">
      <div className="relative py-8 md:py-12 xl:py-16 2xl:pt-24 2xl:pb-48 sm:rounded-[60px] overflow-hidden">
        <div className="max-sm:hidden -bottom-40 absolute bg-secondary blur-[180px] w-72 h-64 start-16"></div>
        <div className="max-sm:hidden -bottom-40 absolute bg-accent blur-[180px] w-72 h-64 -translate-x-1/2 start-1/2"></div>
        <div className="max-sm:hidden -bottom-40 absolute bg-primary blur-[180px] w-72 h-64 end-16"></div>
        <div className="max-sm:hidden z-0 absolute inset-0 opacity-20 grainy"></div>
        <div className="absolute inset-x-0 top-0 h-160 bg-linear-to-b from-(--root-bg) to-transparent max-sm:hidden"></div>

        <div className="relative">
          <div className="text-center">
            <div className="inline-flex items-center bg-linear-to-tr from-secondary to-accent p-2.5 rounded-full text-primary-content">
              <Icon
                icon="lucide--sparkles"
                className="size-5"
                ariaLabel="Intelligence"
              />
            </div>
            <p className="mt-4 font-bold text-xl sm:text-2xl lg:text-4xl">
              Ready to Master Your Domain?
            </p>
            <p className="inline-block mt-3 max-w-2xl max-sm:text-sm">
              Transform scattered documents into living intelligence. Start
              experiencing proactive insights that work for you 24/7.
            </p>
          </div>

          <div className="flex justify-center mt-6 xl:mt-8">
            <ul className="space-y-3 max-w-md text-center">
              <li className="flex items-center gap-2 max-sm:text-sm">
                <Icon
                  icon="lucide--badge-check"
                  className="size-6 text-success"
                  ariaLabel="Check"
                />
                No configuration required—works immediately
              </li>
              <li className="flex items-center gap-2 max-sm:text-sm">
                <Icon
                  icon="lucide--badge-check"
                  className="size-6 text-success"
                  ariaLabel="Check"
                />
                Proactive intelligence that anticipates your needs
              </li>
              <li className="flex items-center gap-2 max-sm:text-sm">
                <Icon
                  icon="lucide--badge-check"
                  className="size-6 text-success"
                  ariaLabel="Check"
                />
                Scales from startup to enterprise
              </li>
            </ul>
          </div>
          <div className="flex justify-center items-center gap-3 sm:gap-5 mt-6 xl:mt-8">
            <Link
              to="/admin"
              className="group relative gap-3 bg-linear-to-r from-secondary to-accent border-0 text-primary-content text-base btn"
            >
              <Icon
                icon="lucide--arrow-right"
                className="size-4 sm:size-5"
                ariaLabel="Get Started"
              />
              Get Started Now
              <div className="top-2 -z-1 absolute inset-x-1 group-hover:inset-x-0 bg-linear-to-r from-secondary to-accent opacity-40 dark:opacity-20 group-hover:dark:!opacity-40 group-hover:opacity-80 blur-md group-hover:blur-lg h-10 transition-all duration-500"></div>
            </Link>
            <a href="#faqs" className="btn btn-ghost">
              Learn more
              <Icon
                icon="lucide--arrow-down"
                className="size-3.5"
                ariaLabel="Scroll to FAQs"
              />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
