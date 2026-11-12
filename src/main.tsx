import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth";
import "./styles.css";

// immagine della pecora (public/pecora.png) usata come sfondo in trasparenza
document.documentElement.style.setProperty("--sheep", `url("${import.meta.env.BASE_URL}pecora.png")`);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
