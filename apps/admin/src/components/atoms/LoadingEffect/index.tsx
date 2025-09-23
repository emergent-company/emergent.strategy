export interface LoadingEffectProps {
    width?: number;
    height?: number | string;
    className?: string;
}

export const LoadingEffect = ({ width, height, className }: LoadingEffectProps) => {
    return <div className={['skeleton', className].filter(Boolean).join(' ')} style={{ width, height }} />;
};

export default LoadingEffect;
