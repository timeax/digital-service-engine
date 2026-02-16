import { describe, expect, it } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

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

/** Order-insensitive compare for string arrays. */
function expectSameMembers(
    actual: string[] | undefined,
    expected: string[],
): void {
    const a = (actual ?? []).slice().sort();
    const b = expected.slice().sort();
    expect(a).toEqual(b);
}

/** Contract: selections may be undefined when empty (treat as empty). */
function expectEmptySelection(value: unknown) {
    expect(
        value === undefined || (Array.isArray(value) && value.length === 0),
    ).toBe(true);
}

const coinMarketCapProps: ServiceProps = {
    name: "CoinMarketCap Followers [Max: 1M] [Start Time: 0 - 24 Hours] [Refill: 30D] [Speed: Up to 50K/D]",
    filters: [{ id: "t:root", label: "Root", service_id: 10110 }] as any,
    fields: [
        {
            id: "f:link",
            type: "text",
            label: "Link",
            name: "link",
            required: true,
            defaults: {
                placeholder: "https://...",
                helpText:
                    "Paste the full target URL. Make sure it is public and accessible.",
            },
            bind_id: "t:root",
        },
        {
            id: "f:quantity",
            type: "number",
            label: "Quantity",
            name: "quantity",
            required: true,
            defaults: {
                min: 10,
                max: 1000000,
                placeholder: "10",
                helpText:
                    "How many units you want delivered. Must be within the service limits.",
            },
            bind_id: "t:root",
            meta: {
                quantity: {
                    valueBy: "value",
                    multiply: 1,
                    clamp: { min: 10, max: 1000000 },
                    fallback: 10,
                },
            } as any,
        },
        {
            id: "f:dripfeed",
            type: "checkbox",
            label: "Enable drip-feed",
            name: "dripfeed",
            required: false,
            defaults: {
                helpText:
                    "Enable this to split delivery into multiple runs over time.",
            },
            bind_id: "t:root",
            button: true,
        },
        {
            id: "f:runs",
            type: "number",
            label: "Runs",
            name: "runs",
            required: false,
            defaults: {
                placeholder: "2",
                helpText:
                    "How many separate runs to split the total quantity into.",
            },
        },
        {
            id: "f:interval",
            type: "number",
            label: "Interval (minutes)",
            name: "interval",
            required: false,
            defaults: {
                placeholder: "5",
                helpText: "Time between each run, in minutes.",
            },
        },
    ] as any,
    includes_for_buttons: {
        "f:dripfeed": ["f:runs", "f:interval"],
    } as any,
    schema_version: "jap.service-props.v1" as any,
    fingerprint: "sp_1u5kn771p91g",
    is_exported: false,
} as any;

describe("useOrderFlow (CoinMarketCap props) – dripfeed reveals runs/interval", () => {
    it("toggling dripfeed makes runs + interval visible", async () => {
        const services: DgpServiceMap = {} as any;

        let flow: ReturnType<typeof useOrderFlow> | null = null;

        function Consumer() {
            flow = useOrderFlow();
            return null;
        }

        const app = await mount(
            <OrderFlowProvider
                serviceProps={coinMarketCapProps}
                init={{ services, mode: "dev" }}
            >
                <Consumer />
            </OrderFlowProvider>,
        );

        expect(flow).toBeTruthy();
        expect(flow!.ready).toBe(true);

        // Initially: only root-bound fields (order not guaranteed)
        expectSameMembers(flow!.visibleGroup?.fieldIds, [
            "f:link",
            "f:quantity",
            "f:dripfeed",
        ]);

        // Toggle dripfeed ON
        await act(async () => {
            // If you made optionId optional: flow!.toggleOption("f:dripfeed");
            flow!.toggleOption("f:dripfeed", "f:dripfeed");
            await flush();
        });

        // Contract tolerance: could be stored exactly as ["f:dripfeed"] or equivalent truthy token array
        expect(flow!.optionSelectionsByFieldId["f:dripfeed"]).toBeTruthy();
        expect(
            (flow!.optionSelectionsByFieldId["f:dripfeed"] ?? []).includes(
                "f:dripfeed",
            ),
        ).toBe(true);

        expectSameMembers(flow!.visibleGroup?.fieldIds, [
            "f:link",
            "f:quantity",
            "f:dripfeed",
            "f:runs",
            "f:interval",
        ]);

        // Toggle dripfeed OFF
        await act(async () => {
            flow!.toggleOption("f:dripfeed", "f:dripfeed");
            await flush();
        });

        // ✅ empty can be undefined or []
        expectEmptySelection(flow!.optionSelectionsByFieldId["f:dripfeed"]);

        expectSameMembers(flow!.visibleGroup?.fieldIds, [
            "f:link",
            "f:quantity",
            "f:dripfeed",
        ]);

        await app.unmount();
    });
});
