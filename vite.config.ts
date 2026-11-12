import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" => funziona anche su GitHub Pages in una sottocartella
export default defineConfig({ plugins: [react()], base: "./" });
