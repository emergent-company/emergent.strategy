import { MetaData } from "@/components/MetaData";

import { BundleOffer } from "./components/BundleOffer";
import { CTA } from "./components/CTA";
import { FAQ } from "./components/FAQ";
import { Features } from "./components/Features";
import { Footer } from "./components/Footer";
import { Hero } from "./components/Hero";
import { Showcase } from "./components/Showcase";
import { Testimonial } from "./components/Testimonial";
import { Topbar } from "./components/Topbar";

const LandingPage = () => {
    return (
        <>
            <MetaData />

            <div>
                <Topbar />
                <Hero />
                <Features />
                <Showcase />
                <Testimonial />
                <CTA />
                <FAQ />
                <BundleOffer />
                <Footer />
            </div>
        </>
    );
};

export default LandingPage;
