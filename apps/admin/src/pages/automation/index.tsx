import { MetaData } from '@/components/atoms/MetaData';

import { Benefits } from './components/Benefits';
import { CTA } from './components/CTA';
import { Features } from './components/Features';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
import { Integrations } from './components/Integrations';
import { Pricing } from './components/Pricing';
import { Process } from './components/Process';
import { Testimonials } from './components/Testimonials';
import { Topbar } from './components/Topbar';

const AutomationLandingPage = () => {
  return (
    <>
      <MetaData title="Automation Landing" />

      <Topbar />
      <Hero />
      <Features />
      <Process />
      <Benefits />
      <CTA />
      <Integrations />
      <Testimonials />
      <Pricing />
      <Footer />
    </>
  );
};

export default AutomationLandingPage;
