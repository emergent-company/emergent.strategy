export interface LogoProps { className?: string }

export const Logo = ({ className }: LogoProps) => {
    return (
        <>
            <img
                src="/images/logo/logo-dark.svg"
                alt="logo-dark"
                className={["hidden h-5 dark:block", className].filter(Boolean).join(' ')}
            />
            <img
                src="/images/logo/logo-light.svg"
                alt="logo-light"
                className={["block h-5 dark:hidden", className].filter(Boolean).join(' ')}
            />
        </>
    );
};

export default Logo;
