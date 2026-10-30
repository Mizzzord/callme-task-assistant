import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

try {
  document.documentElement.classList.toggle(
    "dark",
    localStorage.getItem("ryadom-theme") === "dark",
  );
} catch {
  document.documentElement.classList.remove("dark");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
