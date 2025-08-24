type ILoadingEffect = {
    width?: number;
    height?: number | string;
    className?: string;
};

export const LoadingEffect = ({ width, height, className }: ILoadingEffect) => {
    return <div className={`skeleton ${className}`} style={{ width, height }} />;
};
