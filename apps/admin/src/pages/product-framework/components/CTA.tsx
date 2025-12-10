import { Link } from 'react-router';
import { Icon } from '@/components/atoms/Icon';

export const CTA = () => {
  return (
    <div className="container sm:px-16">
      <div className="relative overflow-hidden py-8 sm:rounded-[60px] md:py-12 xl:py-16 2xl:pb-48 2xl:pt-24">
        <div className="absolute -bottom-40 start-16 h-64 w-72 bg-accent blur-[180px] max-sm:hidden"></div>
        <div className="absolute -bottom-40 h-64 w-72 -translate-x-1/2 start-1/2 bg-secondary blur-[180px] max-sm:hidden"></div>
        <div className="absolute -bottom-40 end-16 h-64 w-72 bg-primary blur-[180px] max-sm:hidden"></div>
        <div className="absolute inset-0 z-0 opacity-20 grainy max-sm:hidden"></div>
        <div className="absolute inset-x-0 top-0 h-160 bg-linear-to-b from-(--root-bg) to-transparent max-sm:hidden"></div>

        <div className="relative">
          <div className="text-center">
            <div className="text-primary-content inline-flex items-center rounded-full bg-linear-to-tr from-accent to-primary p-2.5">
              <Icon
                icon="lucide--target"
                className="size-5"
                ariaLabel="Target"
              />
            </div>
            <p className="mt-4 text-xl font-bold sm:text-2xl lg:text-4xl">
              Design by Emergence
            </p>
            <p className="mt-3 inline-block max-w-2xl max-sm:text-sm">
              Invent the rules, discover the consequences. You define OKRs and
              RATs. The system reveals strategies you couldn't have predicted.
              Trial, iteration, evolution.
            </p>
          </div>

          <div className="mt-6 flex justify-center xl:mt-8">
            <ul className="max-w-md space-y-3 text-center">
              <li className="flex items-center gap-2 max-sm:text-sm">
                <Icon
                  icon="lucide--badge-check"
                  className="text-success size-6"
                  ariaLabel="Check"
                />
                Building blocks + rules = exponential insight
              </li>
              <li className="flex items-center gap-2 max-sm:text-sm">
                <Icon
                  icon="lucide--badge-check"
                  className="text-success size-6"
                  ariaLabel="Check"
                />
                Self-organizing complexity, not chaos or rigidity
              </li>
              <li className="flex items-center gap-2 max-sm:text-sm">
                <Icon
                  icon="lucide--badge-check"
                  className="text-success size-6"
                  ariaLabel="Check"
                />
                Iterate fast, discover emergent strategies
              </li>
            </ul>
          </div>
          <div className="mt-6 flex items-center justify-center gap-3 sm:gap-5 xl:mt-8">
            <Link
              to="/admin"
              className="btn text-primary-content group relative gap-3 border-0 bg-linear-to-r from-accent to-primary text-base"
            >
              <Icon
                icon="lucide--arrow-right"
                className="size-4 sm:size-5"
                ariaLabel="Get Started"
              />
              Start Building
            </Link>
            <a href="#process" className="btn btn-ghost">
              View operating loop
              <Icon
                icon="lucide--arrow-down"
                className="size-3.5"
                ariaLabel="Scroll to process"
              />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
