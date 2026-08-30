import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RetentionApp } from "./pages/RetentionApp";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RetentionApp />
  </StrictMode>,
);
