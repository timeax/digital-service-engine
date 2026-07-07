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

async function settle() {
    await flush();
    await flush();
    await flush();
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

function makeEffectProps(): ServiceProps {
    return {
        schema_version: "1",
        filters: [{ id: "t:root", label: "Root" }],
        fields: [
            {
                id: "f:package",
                type: "select",
                label: "Package",
                bind_id: "t:root",
                options: [{ id: "o:premium", label: "Premium" }],
            },
            {
                id: "f:quality",
                type: "select",
                label: "Quality",
                bind_id: "t:root",
                options: [
                    { id: "o:low", label: "Low" },
                    { id: "o:high", label: "High" },
                ],
                meta: { multi: true },
            },
        ],
        option_effects_for_buttons: {
            "o:premium": {
                "f:quality": {
                    include: ["o:high"],
                },
            },
        },
    };
}

function makeDefaultValueProps(): ServiceProps {
    return {
        schema_version: "1",
        filters: [{ id: "t:root", label: "Root" }],
        fields: [
            {
                id: "f:quantity",
                type: "number",
                label: "Quantity",
                name: "quantity",
                bind_id: "t:root",
                defaultValue: 100,
            },
            {
                id: "f:quality",
                type: "select",
                label: "Quality",
                bind_id: "t:root",
                defaultValue: "o:high",
                options: [
                    { id: "o:low", label: "Low" },
                    { id: "o:high", label: "High" },
                ],
            },
        ],
    };
}

function makeValueEffectRuntimeProps(): ServiceProps {
    return {
        schema_version: "1",
        filters: [
            { id: "t:root", label: "Root" },
            { id: "t:profile", label: "Profile", bind_id: "t:root" },
            { id: "t:post", label: "Post", bind_id: "t:root" },
        ],
        fields: [
            {
                id: "f:link-type",
                type: "text",
                label: "Link type",
                name: "link_type",
                bind_id: ["t:profile", "t:post"],
            },
            {
                id: "f:dripfeed",
                type: "toggle",
                label: "Drip-feed",
                bind_id: "t:root",
                button: true,
            },
            {
                id: "f:runs",
                type: "number",
                label: "Runs",
                name: "runs",
            },
            {
                id: "f:package",
                type: "select",
                label: "Package",
                bind_id: "t:root",
                options: [{ id: "o:premium", label: "Premium" }],
            },
            {
                id: "f:quality",
                type: "select",
                label: "Quality",
                bind_id: "t:root",
                options: [
                    { id: "o:low", label: "Low" },
                    { id: "o:high", label: "High" },
                ],
            },
            {
                id: "f:hidden",
                type: "text",
                label: "Hidden",
                name: "hidden",
                bind_id: "t:post",
            },
        ],
        includes_for_buttons: {
            "f:dripfeed": ["f:runs"],
        },
        value_effects_for_triggers: {
            "t:profile": {
                "f:link-type": { value: "profile" },
            },
            "t:post": {
                "f:link-type": { value: "post" },
            },
            "f:dripfeed": {
                "f:runs": {
                    value: 5,
                    mode: "if_empty",
                    clearOnDeactivate: true,
                },
            },
            "o:premium": {
                "f:quality": { value: "o:high" },
                "f:hidden": { value: "ignored" },
            },
        },
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

    it("exposes visible option ids and prunes hidden selected options", async () => {
        let flow: ReturnType<typeof useOrderFlow> | null = null;
        function Consumer() {
            flow = useOrderFlow();
            return null;
        }

        const app = await mount(
            <OrderFlowProvider
                serviceProps={makeEffectProps()}
                init={{ mode: "prod", services: {} as DgpServiceMap }}
            >
                <Consumer />
            </OrderFlowProvider>,
        );

        await act(async () => {
            flow!.setFieldOptions("f:quality", ["o:low"]);
            await flush();
        });

        await act(async () => {
            flow!.setFieldOptions("f:package", ["o:premium"]);
            await flush();
        });

        expect(flow!.visibleOptionsByFieldId["f:quality"]).toEqual(["o:high"]);

        const snap = flow!.buildSnapshot();
        expect(snap?.inputs.selections["f:quality"]).toBeUndefined();
        expect(
            snap?.selection.fields.find((field) => field.id === "f:quality")
                ?.selectedOptions,
        ).toBeUndefined();

        await app.unmount();
    });

    it("applies field defaultValue only for fresh flows and syncs selectable defaults through Selection", async () => {
        let flow: ReturnType<typeof useOrderFlow> | null = null;
        function Consumer() {
            flow = useOrderFlow();
            return null;
        }

        const app = await mount(
            <OrderFlowProvider
                serviceProps={makeDefaultValueProps()}
                init={{ mode: "prod", services: {} as DgpServiceMap }}
            >
                <Consumer />
            </OrderFlowProvider>,
        );

        await act(async () => {
            await settle();
        });

        expect(flow!.formValuesByFieldId["f:quantity"]).toBe(100);
        expect(flow!.buildSnapshot()?.selection.fields).toContainEqual({
            id: "f:quality",
            type: "select",
            selectedOptions: ["o:high"],
        });

        await app.unmount();
    });

    it("does not overwrite hydrated values with field defaultValue", async () => {
        let flow: ReturnType<typeof useOrderFlow> | null = null;
        function Consumer() {
            flow = useOrderFlow();
            return null;
        }

        const app = await mount(
            <OrderFlowProvider
                serviceProps={makeDefaultValueProps()}
                init={{
                    mode: "prod",
                    services: {} as DgpServiceMap,
                    hydrateFrom: {
                        version: "1",
                        mode: "prod",
                        builtAt: "2026-01-01T00:00:00.000Z",
                        selection: { tag: "t:root", fields: [], buttons: [] },
                        inputs: {
                            form: { quantity: 250 },
                            selections: { "f:quality": ["o:low"] },
                        },
                        quantity: 1,
                        quantitySource: { kind: "default" },
                        services: [],
                        min: 1,
                        max: 1,
                        serviceMap: {},
                        meta: {
                            context: {
                                tag: "t:root",
                                constraints: {},
                                nodeContexts: {},
                                policy: {
                                    ratePolicy: { kind: "lte_primary", pct: 5 },
                                    requireConstraintFit: true,
                                },
                            },
                        },
                    },
                }}
            >
                <Consumer />
            </OrderFlowProvider>,
        );

        await act(async () => {
            await settle();
        });

        expect(flow!.formValuesByFieldId["f:quantity"]).toBe(250);
        expect(flow!.buildSnapshot()?.selection.fields).toContainEqual({
            id: "f:quality",
            type: "select",
            selectedOptions: ["o:low"],
        });

        await app.unmount();
    });

    it("applies tag, button, and option value effects only to visible targets", async () => {
        let flow: ReturnType<typeof useOrderFlow> | null = null;
        function Consumer() {
            flow = useOrderFlow();
            return null;
        }

        const app = await mount(
            <OrderFlowProvider
                serviceProps={makeValueEffectRuntimeProps()}
                init={{ mode: "prod", services: {} as DgpServiceMap }}
            >
                <Consumer />
            </OrderFlowProvider>,
        );

        await act(async () => {
            flow!.selectTag("t:profile");
            await settle();
        });
        expect(flow!.formValuesByFieldId["f:link-type"]).toBe("profile");

        await act(async () => {
            flow!.toggleOption("f:dripfeed");
            await settle();
        });
        expect(flow!.formValuesByFieldId["f:runs"]).toBe(5);

        await act(async () => {
            flow!.setFieldOptions("f:package", ["o:premium"]);
            await settle();
        });
        expect(flow!.buildSnapshot()?.selection.fields).toContainEqual({
            id: "f:quality",
            type: "select",
            selectedOptions: ["o:high"],
        });
        expect(flow!.formValuesByFieldId["f:hidden"]).toBeUndefined();

        await app.unmount();
    });

    it("honors if_empty, clearOnDeactivate ownership, and trigger precedence", async () => {
        let flow: ReturnType<typeof useOrderFlow> | null = null;
        function Consumer() {
            flow = useOrderFlow();
            return null;
        }

        const app = await mount(
            <OrderFlowProvider
                serviceProps={{
                    ...makeValueEffectRuntimeProps(),
                    value_effects_for_triggers: {
                        ...makeValueEffectRuntimeProps()
                            .value_effects_for_triggers,
                        "o:premium": {
                            "f:runs": { value: 9, mode: "always" },
                            "f:quality": { value: "o:high" },
                        },
                    },
                }}
                init={{ mode: "prod", services: {} as DgpServiceMap }}
            >
                <Consumer />
            </OrderFlowProvider>,
        );

        await act(async () => {
            flow!.toggleOption("f:dripfeed");
            await settle();
        });
        expect(flow!.formValuesByFieldId["f:runs"]).toBe(5);

        await act(async () => {
            flow!.setValue("f:runs", 7);
            await settle();
        });
        expect(flow!.formValuesByFieldId["f:runs"]).toBe(7);

        await act(async () => {
            flow!.toggleOption("f:dripfeed");
            await settle();
        });
        expect(flow!.formValuesByFieldId["f:runs"]).toBe(7);

        await act(async () => {
            flow!.toggleOption("f:dripfeed");
            flow!.setFieldOptions("f:package", ["o:premium"]);
            await settle();
        });
        expect(flow!.formValuesByFieldId["f:runs"]).toBe(9);

        await app.unmount();
    });
});
