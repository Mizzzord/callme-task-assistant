import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { TaskCardGallery } from "./components/task-card-gallery";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TaskCardGallery />
  </StrictMode>,
);
