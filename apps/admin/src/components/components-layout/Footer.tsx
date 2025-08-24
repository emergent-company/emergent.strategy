import { Link } from "react-router";

export const Footer = () => {
    return (
        <div className="border-base-300/80 bg-base-100 border-t border-dashed px-4 py-4 md:px-8 xl:px-12 2xl:px-20">
            <div className="flex items-center justify-between px-0">
                <p>
                    Built and designed with care by{" "}
                    <Link to="https://withden.dev/" target="_blank" className="text-primary">
                        Denish
                    </Link>
                </p>
                <Link
                    aria-label="Buy now"
                    to="https://daisyui.com/store/244268"
                    target="_blank"
                    className="bg-primary text-primary-content group flex size-9 items-center gap-2 overflow-hidden rounded-full px-2.5 py-0.5 font-medium transition-all hover:w-26">
                    <span className="iconify lucide--shopping-cart block size-4.5"></span>
                    <span className="hidden text-sm text-nowrap group-hover:block">Buy Now</span>
                </Link>
            </div>
        </div>
    );
};
