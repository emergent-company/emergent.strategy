import { MetaData } from '@/components/atoms/MetaData';
import { ColorSwitcher } from '@/components/organisms/ColorSwitcher';
import { FloatingThemeConfigurator } from '@/components/organisms/FloatingThemeConfigurator';
import { LogoGradientSwitcher } from '@/components/organisms/LogoGradientSwitcher';
import { LogoFontSwitcher } from '@/components/organisms/LogoFontSwitcher';
import { ProductTopbar } from '@/components/organisms/ProductTopbar';
import { SwitcherPanelProvider } from '@/contexts/switcher-panel';

import { Benefits } from './components/Benefits';
import { CTA } from './components/CTA';
import { Ecosystem } from './components/Ecosystem';
import { Features } from './components/Features';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
import { Process } from './components/Process';

const ProductFrameworkLandingPage = () => {
  return (
    <SwitcherPanelProvider>
      <MetaData title="emergent.product - Strategy That Evolves" />

      <ProductTopbar />
      <Hero />
      <Features />
      <Ecosystem />
      <Process />
      <Benefits />
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
    </SwitcherPanelProvider>
  );
};

export default ProductFrameworkLandingPage;
