import React from "react";
import { Link } from "react-router";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { CardsDemo } from "./CardsDemo";
import { CoverflowDemo } from "./CoverflowDemo";
import { GridDemo } from "./GridDemo";
import { NavigationDemo } from "./NavigationDemo";
import { ParallaxDemo } from "./ParallaxDemo";
import { ScrollbarDemo } from "./ScrollbarDemo";
import { SimpleDemo } from "./SimpleDemo";
import { ThumbsDemo } from "./ThumbsDemo";

const CarouselPage = () => {
    return (
        <div>
            <MetaData title="Carousel - SwiperJS" />

            <ComponentPageTitle
                label="Interactions"
                title="Carousel"
                description="Swipeable, responsive carousel with effects, grid layouts, navigation, and thumbnail support"
            />
            <div className="bg-base-200/40 rounded-box mt-6 px-5 py-4 lg:mt-12">
                <p className="text-base-content/60 font-medium">Usage guidelines</p>
                <p className="mt-1">
                    <span className="me-1">- Plugin Documentation:</span>
                    <Link to="https://swiperjs.com/" target="_blank" className="text-primary">
                        Swiperjs
                    </Link>
                </p>
            </div>
            <p className="text-base-content/60 mt-6 font-medium">Demos</p>
            <div className="mt-6 space-y-6">
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Simple</div>
                    <div className="p-6">
                        <SimpleDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Navigation</div>
                    <div className="p-6">
                        <NavigationDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Scrollbar</div>
                    <div className="p-6">
                        <ScrollbarDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Grid</div>
                    <div className="p-6">
                        <GridDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Parallax</div>
                    <div className="p-6">
                        <ParallaxDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Coverflow Effect</div>
                    <div className="p-6">
                        <CoverflowDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Cards Effect</div>
                    <div className="p-6">
                        <CardsDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Thumbs</div>
                    <div className="p-6">
                        <ThumbsDemo />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CarouselPage;
