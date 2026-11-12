import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" => funziona anche su GitHub Pages in una sottocartella
// data e ora della build: mostrata in Impostazioni per sapere quale versione si sta usando
const BUILD = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" });

export default defineConfig({ plugins: [react()], base: "./", define: { __BUILD_TIME__: JSON.stringify(BUILD) } });
