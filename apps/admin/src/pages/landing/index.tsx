import { MetaData } from '@/components';
import { ColorSwitcher } from '@/components/organisms/ColorSwitcher';
import { FloatingThemeConfigurator } from '@/components/organisms/FloatingThemeConfigurator';
import { LogoGradientSwitcher } from '@/components/organisms/LogoGradientSwitcher';
import { LogoFontSwitcher } from '@/components/organisms/LogoFontSwitcher';
import { ProductTopbar } from '@/components/organisms/ProductTopbar';
import { SwitcherPanelProvider } from '@/contexts/switcher-panel';

// import { BundleOffer } from './components/BundleOffer';
import { CTA } from './components/CTA';
// import { FAQ } from './components/FAQ';
import { Features } from './components/Features';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
// import { Showcase } from './components/Showcase';
// import { Testimonial } from './components/Testimonial';

const LandingPage = () => {
  return (
    <SwitcherPanelProvider>
      <div data-testid="page-landing">
        <MetaData title="Emergent - Adaptive Systems for AI" />

        <div>
          <ProductTopbar />
          <Hero />
          <Features />
          {/* TODO: Replace these with vision-specific content
          <Showcase />
          <Testimonial />
          <FAQ />
          <BundleOffer />
          */}
          <CTA />
          <Footer />
          {import.meta.env.DEV && (
            <>
              <ColorSwitcher />
              <LogoGradientSwitcher />
              <LogoFontSwitcher />
              <FloatingThemeConfigurator />
            </>
          )}
        </div>
      </div>
    </SwitcherPanelProvider>
  );
};

export default LandingPage;
