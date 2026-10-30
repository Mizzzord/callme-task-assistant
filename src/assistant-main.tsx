import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { AssistantGallery } from "./components/assistant-gallery";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AssistantGallery />
  </StrictMode>,
);
