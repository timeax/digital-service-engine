// tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig([
    {
        entry: { "schema/index": "src/schema/index.ts" },
        dts: true,
        format: ["esm", "cjs"],
        sourcemap: true,
        outDir: "dist",
        clean: false,
    },

    {
        entry: { "core/index": "src/core/index.ts" },
        dts: true,
        format: ["esm", "cjs"],
        sourcemap: true,
        outDir: "dist",
        clean: false,
        external: [], // keep core light
    },

    {
        entry: { "react/index": "src/react/index.ts" },
        dts: true,
        format: ["esm", "cjs"],
        sourcemap: true,
        outDir: "dist",
        clean: false,
        external: ["react", "react-dom", "reactflow", "react/jsx-runtime"],
    },

    {
        entry: { "workspace/index": "src/react/workspace/index.ts" },
        dts: true,
        format: ["esm", "cjs"],
        sourcemap: true,
        outDir: "dist",

        // IMPORTANT:
        bundle: true, // you can keep this if you want
        clean: false,

        // MUST include jsx-runtime here too
        external: ["react", "react-dom", "reactflow", "react/jsx-runtime"],
    },
]);
