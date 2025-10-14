import React, { useEffect, useRef } from "react";
import { MetaData } from "@/components/atoms/MetaData";
import { useAuth } from "@/contexts/auth";

const LoginPage = () => {
    const { beginLogin } = useAuth();
    const attemptedRef = useRef(false);

    useEffect(() => {
        if (!attemptedRef.current) {
            attemptedRef.current = true;
            void beginLogin();
        }
    }, [beginLogin]);

    // No local submit; pure redirect flow.

    return (
        <div data-testid="page-auth-login">
            <MetaData title="Redirecting…" />
            <div className="flex justify-center items-center bg-base-100 bg-none w-screen h-screen">
                <span className="loading loading-spinner loading-lg" aria-label="Redirecting" />
            </div>
        </div>
    );
};

export default LoginPage;
