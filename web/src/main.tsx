import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Dashboard } from "./pages/Dashboard";
import { ResidentCallButton } from "./pages/ResidentCallButton";
import "./index.css";

const isResidentView = window.location.pathname.startsWith("/resident");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isResidentView ? <ResidentCallButton /> : <Dashboard />}</StrictMode>,
);
