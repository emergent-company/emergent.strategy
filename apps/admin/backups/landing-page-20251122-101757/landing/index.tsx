import { MetaData } from '@/components';
import { ColorSwitcher } from '@/components/organisms/ColorSwitcher';
import { LogoGradientSwitcher } from '@/components/organisms/LogoGradientSwitcher';

import { Benefits } from './components/Benefits';
import { CTA } from './components/CTA';
import { FAQ } from './components/FAQ';
import { Features } from './components/Features';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
import { Process } from './components/Process';
import { Topbar } from './components/Topbar';

const LandingPage = () => {
  return (
    <div className="hero-glow" data-testid="page-landing">
      <MetaData />

      <div>
        <Topbar />
        <Hero />
        <Features />
        <Process />
        <Benefits />
        <CTA />
        <FAQ />
        <Footer />

        {/* Dev-mode Switchers */}
        <ColorSwitcher />
        <LogoGradientSwitcher />
      </div>
    </div>
  );
};

export default LandingPage;
