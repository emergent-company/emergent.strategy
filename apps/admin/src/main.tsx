import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import { ConfigProvider } from "@/contexts/config";
import { Router } from "@/router";

import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <BrowserRouter>
            <ConfigProvider>
                <Router />
            </ConfigProvider>
        </BrowserRouter>
    </StrictMode>,
);
