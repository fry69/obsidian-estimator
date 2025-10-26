import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SWUpdater from "./hooks/SWUpdater.ts";
import App from "./App.tsx";
import "./index.css";
import interVarFontUrl from "./assets/fonts/inter-variable.woff2?url";

const queryClient = new QueryClient();

const preloadFont = (href: string) => {
  if (!href || typeof document === "undefined") {
    return;
  }

  const link = document.createElement("link");
  link.rel = "preload";
  link.href = href;
  link.as = "font";
  link.type = "font/woff2";
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
};

preloadFont(interVarFontUrl);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SWUpdater />
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
