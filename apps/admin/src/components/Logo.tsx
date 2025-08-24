type ILogo = {
    className?: string;
};

export const Logo = ({ className }: ILogo) => {
    return (
        <>
            <img
                src="/images/logo/logo-dark.svg"
                alt="logo-dark"
                className={`hidden h-5 dark:block ${className ?? ""}`}
            />
            <img
                src="/images/logo/logo-light.svg"
                alt="logo-light"
                className={`block h-5 dark:hidden ${className ?? ""}`}
            />
        </>
    );
};
