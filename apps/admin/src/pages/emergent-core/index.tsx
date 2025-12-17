import { MetaData } from '@/components/atoms/MetaData';
import { ColorSwitcher } from '@/components/organisms/ColorSwitcher';
import { FloatingThemeConfigurator } from '@/components/organisms/FloatingThemeConfigurator';
import { LogoGradientSwitcher } from '@/components/organisms/LogoGradientSwitcher';
import { LogoFontSwitcher } from '@/components/organisms/LogoFontSwitcher';
import { ProductTopbar } from '@/components/organisms/ProductTopbar';
import { SwitcherPanelProvider } from '@/contexts/switcher-panel';

import { Benefits } from './components/Benefits';
import { CTA } from './components/CTA';
import { Features } from './components/Features';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
// import { Integrations } from './components/Integrations';
// import { Pricing } from './components/Pricing';
import { Process } from './components/Process';
// import { Testimonials } from './components/Testimonials';

const EmergentCoreLandingPage = () => {
  return (
    <SwitcherPanelProvider>
      <MetaData title="emergent.core - The Foundation for Adaptive Systems" />

      <ProductTopbar />
      <Hero />
      <Features />
      <Process />
      <Benefits />
      <CTA />
      {/* TODO: Replace these sections with technical content
      <Integrations />
      <Testimonials />
      <Pricing />
      */}
      <Footer />
      {import.meta.env.DEV && (
        <>
          <ColorSwitcher />
          <LogoGradientSwitcher />
          <LogoFontSwitcher />
          <FloatingThemeConfigurator />
        </>
      )}
    </SwitcherPanelProvider>
  );
};

export default EmergentCoreLandingPage;
