import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

// Resolve the renderer and router from this app, including during Vite development.
startTransition(() => {
  hydrateRoot(document, <StrictMode><HydratedRouter /></StrictMode>);
});
