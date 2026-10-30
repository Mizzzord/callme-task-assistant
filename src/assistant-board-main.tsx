import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { TooltipProvider } from "./components/ui/tooltip";
import { AssistantBoardPreview } from "./components/assistant-board-preview";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <AssistantBoardPreview />
    </TooltipProvider>
  </StrictMode>,
);
