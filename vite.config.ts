import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "node:path";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: [
            { find: "@", replacement: path.resolve(__dirname, "src") },

            // ✅ Catch ALL toast-ui editor css imports
            {
                find: /^@toast-ui\/editor\/dist\/.*\.css$/,
                replacement: path.resolve(__dirname, "test/empty.css"),
            },
        ],
    },

    // ✅ Ensure Vite handles these deps during tests (instead of Node trying to load them as-is)
    ssr: {
        noExternal: ["@timeax/form-palette", "@toast-ui/editor"],
    },

    test: {
        globals: true,
        environment: "jsdom",
        include: ["src/**/*.{test,spec}.{ts,tsx}"],
        setupFiles: ["./vitest.setup.ts"],
        css: true,

        // ✅ Inline/bundle these deps in Vitest so Vite transforms them
        deps: {
            inline: ["@timeax/form-palette", "@toast-ui/editor"],
        },
    },
});
