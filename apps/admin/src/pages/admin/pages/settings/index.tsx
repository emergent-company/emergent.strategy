import React from "react";
import { Navigate } from "react-router";

// This page is deprecated in favor of focused AI Prompts settings.
export default function SettingsIndexRedirect() {
    return <Navigate to="/admin/settings/ai/prompts" replace />;
}
