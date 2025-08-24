export type IHelpTopic = {
    title: string;
    description: string;
};

export const HelpTopic = ({ title, description }: IHelpTopic) => {
    return (
        <div className="card card-border bg-base-100 hover:bg-primary hover:text-primary-content group hover:border-primary cursor-pointer transition-all">
            <div className="card-body">
                <div className="flex justify-between">
                    <p className="font-medium">{title}</p>
                    <span className="iconify lucide--arrow-right text-primary-content -translate-x-2 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"></span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm overflow-ellipsis">{description}</p>
            </div>
        </div>
    );
};
