import { IStatItem, StatItem } from "./StatItem";

const statItems: IStatItem[] = [
    {
        image: "/images/apps/files/one-drive.svg",
        name: "One Drive",
        used: 85,
        total: 250,
        progressClass: "progress-primary",
    },
    {
        image: "/images/apps/files/google-drive.svg",
        name: "Google Drive",
        used: 56,
        total: 100,
        progressClass: "progress-warning",
    },
    {
        image: "/images/apps/files/mega.svg",
        name: "Mega",
        used: 126,
        total: 150,
        progressClass: "progress-error",
    },
    {
        image: "/images/apps/files/dropbox.svg",
        name: "Dropbox",
        used: 22,
        total: 40,
        progressClass: "progress-info",
    },
];

export const StatList = () => {
    return (
        <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-4">
            {statItems.map((item, index) => (
                <StatItem {...item} key={index} />
            ))}
        </div>
    );
};
