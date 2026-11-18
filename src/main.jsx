import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { TeamWorkspace } from "./TeamWorkspace.jsx";
import "./team-conversation.css";

const LegacyApp = lazy(() => import('./WorkspaceArchive.jsx'));
const legacy = ['legacy','archive'].includes(new URLSearchParams(window.location.search).get('view'));

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {legacy ? <Suspense fallback={<p>正在載入原工作台…</p>}><LegacyApp /></Suspense> : <TeamWorkspace />}
  </React.StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/sw.js").catch(() => {}),
  );
}
