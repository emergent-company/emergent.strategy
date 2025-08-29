import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import { ConfigProvider } from "@/contexts/config";
import { AuthProvider } from "@/contexts/auth";
import { Router } from "@/router";

import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <BrowserRouter>
            <ConfigProvider>
                <AuthProvider>
                    <Router />
                </AuthProvider>
            </ConfigProvider>
        </BrowserRouter>
    </StrictMode>,
);
