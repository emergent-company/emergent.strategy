import { Link } from "react-router";

import { MetaData } from "@/components";

const NotFoundPage = () => {
    return (
        <>
            <MetaData title="Not Found - 404" noIndex />

            <div className="flex flex-col justify-center items-center w-screen h-screen">
                <img src="/images/landscape/error-404.svg" alt="error" className="max-h-[400px]" />
                <Link to="/landing" className="mt-5 btn btn-primary">
                    Go to Home
                </Link>
            </div>
        </>
    );
};

export default NotFoundPage;
