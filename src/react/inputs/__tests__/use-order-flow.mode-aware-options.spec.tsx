import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";

import type { ServiceProps } from "@/schema";
import type { DgpServiceMap } from "@/schema/provider";
import { OrderFlowProvider, useOrderFlow } from "@/react/hooks";

async function flush() {
    await Promise.resolve();
    await Promise.resolve();
}

async function mount(ui: React.ReactElement) {
    const host = document.createElement("div");
    document.body.appendChild(host);

    let root: Root | null = null;
    await act(async () => {
        root = createRoot(host);
        root!.render(ui);
        await flush();
    });

    return {
        async unmount() {
            await act(async () => {
                root?.unmount();
                await flush();
            });
            host.remove();
        },
    };
}

function makeProps(meta?: { multi?: boolean }): ServiceProps {
    return {
        schema_version: "1",
        filters: [{ id: "t:root", label: "Root" }],
        fields: [
            {
                id: "f:color",
                type: "select",
                label: "Color",
                bind_id: "t:root",
                options: [
                    { id: "o:red", label: "Red" },
                    { id: "o:blue", label: "Blue" },
                ],
                ...(meta ? { meta } : {}),
            },
        ],
    };
}

describe("useOrderFlow setFieldOptions mode-aware behavior", () => {
    it("prod + non-multi keeps latest option only", async () => {
        let flow: ReturnType<typeof useOrderFlow> | null = null;
        function Consumer() {
            flow = useOrderFlow();
            return null;
        }

        const app = await mount(
            <OrderFlowProvider
                serviceProps={makeProps()}
                init={{ mode: "prod", services: {} as DgpServiceMap }}
            >
                <Consumer />
            </OrderFlowProvider>,
        );

        await act(async () => {
            flow!.setFieldOptions("f:color", ["o:red", "o:blue"]);
            await flush();
        });

        const snap = flow!.buildSnapshot();
        expect(snap?.selection.fields).toEqual([
            { id: "f:color", type: "select", selectedOptions: ["o:blue"] },
        ]);

        await app.unmount();
    });

    it("prod + meta.multi=true keeps multiple options", async () => {
        let flow: ReturnType<typeof useOrderFlow> | null = null;
        function Consumer() {
            flow = useOrderFlow();
            return null;
        }

        const app = await mount(
            <OrderFlowProvider
                serviceProps={makeProps({ multi: true })}
                init={{ mode: "prod", services: {} as DgpServiceMap }}
            >
                <Consumer />
            </OrderFlowProvider>,
        );

        await act(async () => {
            flow!.setFieldOptions("f:color", ["o:red", "o:blue"]);
            await flush();
        });

        const snap = flow!.buildSnapshot();
        expect(snap?.selection.fields).toEqual([
            {
                id: "f:color",
                type: "select",
                selectedOptions: ["o:red", "o:blue"],
            },
        ]);

        await app.unmount();
    });

    it("dev keeps multiple options and dedupes exact duplicates", async () => {
        let flow: ReturnType<typeof useOrderFlow> | null = null;
        function Consumer() {
            flow = useOrderFlow();
            return null;
        }

        const app = await mount(
            <OrderFlowProvider
                serviceProps={makeProps()}
                init={{ mode: "dev", services: {} as DgpServiceMap }}
            >
                <Consumer />
            </OrderFlowProvider>,
        );

        await act(async () => {
            flow!.setFieldOptions("f:color", [
                "o:red",
                "o:red",
                "o:blue",
                "o:blue",
            ]);
            await flush();
        });

        await act(async () => {
            flow!.setFieldOptions("f:color", ["o:red", "o:blue", "o:blue"]);
            await flush();
        });

        const snap = flow!.buildSnapshot();
        expect(snap?.selection.fields).toEqual([
            {
                id: "f:color",
                type: "select",
                selectedOptions: ["o:red", "o:blue"],
            },
        ]);

        await app.unmount();
    });
});

