import { Icon } from "@/components/ui/Icon";

export type IHelpTopic = {
    title: string;
    description: string;
};

export const HelpTopic = ({ title, description }: IHelpTopic) => {
    return (
        <div className="group bg-base-100 hover:bg-primary card-border hover:border-primary hover:text-primary-content transition-all cursor-pointer card">
            <div className="card-body">
                <div className="flex justify-between">
                    <p className="font-medium">{title}</p>
                    <Icon
                        icon="lucide--arrow-right"
                        className="opacity-0 group-hover:opacity-100 text-primary-content transition-all -translate-x-2 group-hover:translate-x-0"
                    />
                </div>
                <p className="mt-1 overflow-ellipsis text-sm line-clamp-2">{description}</p>
            </div>
        </div>
    );
};
