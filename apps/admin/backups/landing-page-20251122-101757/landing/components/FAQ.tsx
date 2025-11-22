import { Link } from 'react-router';
import { Icon } from '@/components/atoms/Icon';

export const FAQ = () => {
  return (
    <div className="py-8 md:py-12 2xl:py-24 xl:py-16 container" id="faqs">
      <div className="gap-12 lg:gap-24 grid grid-cols-1 lg:grid-cols-7">
        <div className="flex flex-col max-sm:items-center col-span-1 lg:col-span-3 max-sm:text-center">
          <div className="inline-flex items-center bg-purple-500/5 p-2 border border-purple-500/10 rounded-box w-fit">
            <Icon
              icon="lucide--messages-square"
              className="size-5 text-purple-600"
              ariaLabel="Support"
            />
          </div>
          <p className="mt-4 font-semibold text-2xl sm:text-3xl">
            Common Questions
          </p>
          <p className="inline-block mt-3 max-w-lg max-sm:text-sm text-base-content/70">
            Learn how Emergent can transform your organization's knowledge into
            actionable intelligence.
          </p>
          <Link className="mt-4 w-fit btn btn-sm" to="/admin">
            Get Started
          </Link>
        </div>
        <div className="lg:col-span-4">
          <div className="space-y-0">
            <div className="collapse collapse-plus border-base-300">
              <input
                type="radio"
                aria-label="Accordion radio"
                name="accordion"
                defaultChecked
              />
              <div className="collapse-title font-medium sm:text-xl cursor-pointer">
                <div className="flex items-center gap-4 ite">
                  <div className="inline-flex justify-center items-center p-1.5 border border-base-300 rounded-box">
                    <Icon
                      icon="lucide--brain"
                      className="size-4.5"
                      ariaLabel="Intelligence"
                    />
                  </div>
                  How does Emergent understand my documents?
                </div>
              </div>
              <div className="collapse-content ms-12">
                <p>
                  Emergent uses advanced AI to automatically extract meaning,
                  identify relationships, and build a semantic understanding of
                  your content. No manual tagging or configuration required—just
                  upload your documents and Emergent learns your domain.
                </p>
              </div>
            </div>
            <div className="collapse collapse-plus border-base-300">
              <input
                type="radio"
                aria-label="Accordion radio"
                name="accordion"
              />
              <div className="collapse-title font-medium sm:text-xl cursor-pointer">
                <div className="flex items-center gap-4 ite">
                  <div className="inline-flex justify-center items-center p-1.5 border border-base-300 rounded-box">
                    <Icon
                      icon="lucide--sparkles"
                      className="size-4.5"
                      ariaLabel="Proactive"
                    />
                  </div>
                  What does "proactive intelligence" mean?
                </div>
              </div>
              <div className="collapse-content ms-12">
                <p>
                  Unlike traditional search where you must know what to ask,
                  Emergent actively surfaces relevant insights based on your
                  current context. It anticipates your needs by understanding
                  what you're working on and delivering related information
                  before you even search for it.
                </p>
              </div>
            </div>
            <div className="collapse collapse-plus border-base-300">
              <input
                type="radio"
                aria-label="Accordion radio"
                name="accordion"
              />
              <div className="collapse-title font-medium sm:text-xl cursor-pointer">
                <div className="flex items-center gap-4 ite">
                  <div className="inline-flex justify-center items-center p-1.5 border border-base-300 rounded-box">
                    <Icon
                      icon="lucide--lock"
                      className="size-4.5"
                      ariaLabel="Security"
                    />
                  </div>
                  Is my data secure?
                </div>
              </div>
              <div className="collapse-content ms-12">
                <p>
                  Absolutely. Your documents and data remain private and secure.
                  Emergent processes everything within your own infrastructure,
                  with enterprise-grade encryption and access controls to
                  protect sensitive information.
                </p>
              </div>
            </div>
            <div className="collapse collapse-plus border-base-300">
              <input
                type="radio"
                aria-label="Accordion radio"
                name="accordion"
              />
              <div className="collapse-title font-medium sm:text-xl cursor-pointer">
                <div className="flex items-center gap-4 ite">
                  <div className="inline-flex justify-center items-center p-1.5 border border-base-300 rounded-box">
                    <Icon
                      icon="lucide--users"
                      className="size-4.5"
                      ariaLabel="Teams"
                    />
                  </div>
                  How does it help teams collaborate?
                </div>
              </div>
              <div className="collapse-content ms-12">
                <p>
                  Emergent ensures everyone works from the same up-to-date
                  knowledge base. When documents change, the system
                  automatically updates relationships and insights, keeping your
                  entire team aligned without manual coordination.
                </p>
              </div>
            </div>
            <div className="collapse collapse-plus border-base-300">
              <input
                type="radio"
                aria-label="Accordion radio"
                name="accordion"
              />
              <div className="collapse-title font-medium sm:text-xl cursor-pointer">
                <div className="flex items-center gap-4 ite">
                  <div className="inline-flex justify-center items-center p-1.5 border border-base-300 rounded-box">
                    <Icon
                      icon="lucide--trending-up"
                      className="size-4.5"
                      ariaLabel="Scale"
                    />
                  </div>
                  Will it scale with our organization?
                </div>
              </div>
              <div className="collapse-content ms-12">
                <p>
                  Yes. Emergent is built to grow from small teams to enterprise
                  deployments. Whether you have hundreds or millions of
                  documents, the system maintains fast, relevant results as your
                  knowledge base expands.
                </p>
              </div>
            </div>
            <div className="collapse collapse-plus border-base-300">
              <input
                type="radio"
                aria-label="Accordion radio"
                name="accordion"
              />
              <div className="collapse-title font-medium sm:text-xl cursor-pointer">
                <div className="flex items-center gap-4 ite">
                  <div className="inline-flex justify-center items-center p-1.5 border border-base-300 rounded-box">
                    <Icon
                      icon="lucide--zap"
                      className="size-4.5"
                      ariaLabel="Setup"
                    />
                  </div>
                  How quickly can we get started?
                </div>
              </div>
              <div className="collapse-content ms-12">
                <p>
                  Getting started is simple. Upload your first documents, and
                  Emergent begins learning immediately. Most teams see valuable
                  insights within hours, and the system becomes more powerful as
                  it processes more of your domain knowledge.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
