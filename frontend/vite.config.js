/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    // process.env wins over .env files so a docker-compose `environment:` value
    // overrides the bind-mounted .env.development (which targets localhost for
    // host-side dev).
    const proxyTarget = process.env.VITE_PROXY_TARGET || env.VITE_PROXY_TARGET || "http://backend:8000";
    return {
        plugins: [react()],
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "./src"),
            },
        },
        server: {
            host: "0.0.0.0",
            port: 5173,
            proxy: {
                "/api": {
                    target: proxyTarget,
                    changeOrigin: true,
                },
                // Mirrors the prod nginx proxy so the in-app "Guide" link works in dev too.
                "/documentation": {
                    target: proxyTarget,
                    changeOrigin: true,
                },
            },
        },
        test: {
            globals: true,
            environment: "jsdom",
            setupFiles: ["./src/test/setup.ts"],
            css: false,
        },
    };
});
