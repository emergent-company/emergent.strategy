export interface PageTitleHeroProps {
    label?: string;
    title: string;
    description: string;
}

export function PageTitleHero({ title, description, label }: PageTitleHeroProps) {
    return (
        <div className="flex flex-col justify-center items-center space-y-0.5">
            {label && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 border border-base-300 rounded-full text-xs text-base-content/80 leading-none tracking-[0.2px]">
                    <div className="bg-base-content/30 status status-sm" />
                    {label}
                </div>
            )}
            <p className="bg-clip-text bg-linear-to-b from-base-content to-base-content/75 pb-1 font-bold text-transparent text-3xl lg:text-4xl 2xl:text-5xl tracking-tight">
                {title}
            </p>
            <p className="max-w-lg max-md:text-sm text-base-content/80 text-center">{description}</p>
        </div>
    );
}

export default PageTitleHero;
