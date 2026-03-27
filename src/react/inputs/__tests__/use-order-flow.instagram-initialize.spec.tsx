import { describe, expect, it } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { OrderSnapshot } from "@/schema/order";

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

function expectSameMembers(
    actual: Array<string | number> | undefined,
    expected: Array<string | number>,
): void {
    const normalize = (arr: Array<string | number>) =>
        arr.map((v) => String(v)).sort();

    expect(normalize(actual ?? [])).toEqual(normalize(expected));
}

const SERVICE_PROPS = {
    filters: [
        { id: "t:root", label: "Root", service_id: 28 },
        {
            id: "t:1",
            label: "Guranteed",
            bind_id: "t:root",
            service_id: 25,
        },
        { id: "t:2", label: "Targeted", bind_id: "t:root" },
    ],
    fields: [
        {
            id: "f:1",
            type: "number",
            bind_id: "t:1",
            name: "quantity",
            pricing_role: "base",
            label: "Quantity",
            required: true,
            defaults: {
                placeholder: "Enter quantity",
                helpText: "Min - {min ?? 50}",
                showButtons: true,
                min: 50,
                max: 500000,
            },
            meta: { quantity: { valueBy: "value" } },
        },
    ],
    order_for_tags: [],
    schema_version: "1",
} as const;

const SERVICES = {
    "25": {
        id: 618,
        service: "25",
        key: "25",
        name: "Instagram Followers [???? ARAB / ???? INDIA / ???? TURK MIX] [Refill: 30D] [Max: 10K] [Start Time: 0 - 1 Hr] [Speed: 20K/D] ???",
        rate: 2.125,
        min: 50,
        max: 500000,
        flags: {
            refill: {
                id: "refill",
                enabled: false,
                description:
                    "Service supports refill after completion (if provider allows).",
            },
            cancel: {
                id: "cancel",
                enabled: false,
                description:
                    "Service supports cancellation (if provider allows).",
            },
            dripfeed: {
                id: "dripfeed",
                enabled: true,
                description:
                    "Service supports drip-feed delivery (if provider allows).",
            },
            contract: {
                id: "contract",
                enabled: false,
                description:
                    "Service is a contract-type service (handled via contract flow/contract rules).",
            },
        },
        estimate: [],
        sync_version: 6,
        category: "Instagram Followers [Targeted]",
        dgp_handler_id: 1,
        meta: {
            type: "Default",
            raw: {
                service: 25,
                name: "Instagram Followers [???? ARAB / ???? INDIA / ???? TURK MIX] [Refill: 30D] [Max: 10K] [Start Time: 0 - 1 Hr] [Speed: 20K/D] ???",
                type: "Default",
                rate: "2.125",
                min: 50,
                max: 500000,
                dripfeed: true,
                refill: false,
                cancel: false,
                category: "Instagram Followers [Targeted]",
            },
        },
        originals: {
            id: "25",
            name: "Instagram Followers [???? ARAB / ???? INDIA / ???? TURK MIX] [Refill: 30D] [Max: 10K] [Start Time: 0 - 1 Hr] [Speed: 20K/D] ???",
            rate: 2.125,
            min: 50,
            max: 500000,
            category: "Instagram Followers [Targeted]",
            flags: {
                refill: {
                    id: "refill",
                    enabled: false,
                    description:
                        "Service supports refill after completion (if provider allows).",
                },
                cancel: {
                    id: "cancel",
                    enabled: false,
                    description:
                        "Service supports cancellation (if provider allows).",
                },
                dripfeed: {
                    id: "dripfeed",
                    enabled: true,
                    description:
                        "Service supports drip-feed delivery (if provider allows).",
                },
                contract: {
                    id: "contract",
                    enabled: false,
                    description:
                        "Service is a contract-type service (handled via contract flow/contract rules).",
                },
            },
            meta: {
                type: "Default",
                raw: {
                    service: 25,
                    name: "Instagram Followers [???? ARAB / ???? INDIA / ???? TURK MIX] [Refill: 30D] [Max: 10K] [Start Time: 0 - 1 Hr] [Speed: 20K/D] ???",
                    type: "Default",
                    rate: "2.125",
                    min: 50,
                    max: 500000,
                    dripfeed: true,
                    refill: false,
                    cancel: false,
                    category: "Instagram Followers [Targeted]",
                },
            },
        },
        status: "active",
        created_at: "2026-03-21T04:36:54.000000Z",
        updated_at: "2026-03-21T04:36:54.000000Z",
    },
    "28": {
        id: 416,
        service: "28",
        key: "28",
        name: "Instagram Followers [SPAM ON] [Max: 1M] [Refill: 90D] [Start Time: 0 - 1 Hour] [Speed: Up to 50K/Day] ?????",
        rate: 4.3125,
        min: 10,
        max: 10000000,
        flags: {
            refill: {
                id: "refill",
                enabled: true,
                description:
                    "Service supports refill after completion (if provider allows).",
            },
            cancel: {
                id: "cancel",
                enabled: true,
                description:
                    "Service supports cancellation (if provider allows).",
            },
            dripfeed: {
                id: "dripfeed",
                enabled: true,
                description:
                    "Service supports drip-feed delivery (if provider allows).",
            },
            contract: {
                id: "contract",
                enabled: false,
                description:
                    "Service is a contract-type service (handled via contract flow/contract rules).",
            },
        },
        estimate: [],
        sync_version: 6,
        category: "Instagram Followers [Guaranteed]",
        dgp_handler_id: 1,
        meta: {
            type: "Default",
            raw: {
                service: 28,
                name: "Instagram Followers [SPAM ON] [Max: 1M] [Refill: 90D] [Start Time: 0 - 1 Hour] [Speed: Up to 50K/Day] ?????",
                type: "Default",
                rate: "4.3125",
                min: 10,
                max: 10000000,
                dripfeed: true,
                refill: true,
                cancel: true,
                category: "Instagram Followers [Guaranteed]",
            },
        },
        originals: {
            id: "28",
            name: "Instagram Followers [SPAM ON] [Max: 1M] [Refill: 90D] [Start Time: 0 - 1 Hour] [Speed: Up to 50K/Day] ?????",
            rate: 4.3125,
            min: 10,
            max: 10000000,
            category: "Instagram Followers [Guaranteed]",
            flags: {
                refill: {
                    id: "refill",
                    enabled: true,
                    description:
                        "Service supports refill after completion (if provider allows).",
                },
                cancel: {
                    id: "cancel",
                    enabled: true,
                    description:
                        "Service supports cancellation (if provider allows).",
                },
                dripfeed: {
                    id: "dripfeed",
                    enabled: true,
                    description:
                        "Service supports drip-feed delivery (if provider allows).",
                },
                contract: {
                    id: "contract",
                    enabled: false,
                    description:
                        "Service is a contract-type service (handled via contract flow/contract rules).",
                },
            },
            meta: {
                type: "Default",
                raw: {
                    service: 28,
                    name: "Instagram Followers [SPAM ON] [Max: 1M] [Refill: 90D] [Start Time: 0 - 1 Hour] [Speed: Up to 50K/Day] ?????",
                    type: "Default",
                    rate: "4.3125",
                    min: 10,
                    max: 10000000,
                    dripfeed: true,
                    refill: true,
                    cancel: true,
                    category: "Instagram Followers [Guaranteed]",
                },
            },
        },
        status: "active",
        created_at: "2026-03-21T04:36:50.000000Z",
        updated_at: "2026-03-21T04:36:50.000000Z",
    },
} as const;

const INITIALIZE_PAYLOAD = {
    serviceProps: SERVICE_PROPS,
    init: {
        mode: "prod",
        services: SERVICES,
        ctx: {
            service: {
                id: 2,
                name: "Instagram Followers",
                platform_id: 1,
                category_id: 2,
                dgp_handler_id: 1,
                props: SERVICE_PROPS,
                serviceMap: SERVICES,
                similars: [],
            },
            platform: {
                id: 1,
                name: "Instagram",
                url: "https://instagram.com",
                aliases: ["instagram", "insta", "ig"],
                image: null,
                icon: null,
                color: null,
                status: "active",
                created_at: "2026-03-20T18:24:55.000000Z",
                updated_at: "2026-03-20T18:24:55.000000Z",
                deleted_at: null,
            },
            category: {
                id: 2,
                name: "Followers",
                category_id: null,
                status: "active",
                created_at: "2026-03-20T18:24:55.000000Z",
                updated_at: "2026-03-20T18:24:55.000000Z",
                deleted_at: null,
                children_count: 0,
                parent: null,
            },
            handler: {
                id: 1,
                name: "Just Another Panel",
                image: null,
                balance: 2.5958095,
                threshold: 1,
                currency: "USD",
                display_name: "Server 1",
                description: null,
                alias: "jap",
                plugin_id: 1,
                status: "active",
                created_at: "2026-03-20T18:50:52.000000Z",
                updated_at: "2026-03-20T18:51:29.000000Z",
                deleted_at: null,
                rate_normalise_op: "divide",
                rate_normalise_value: 1000,
                dgp_services_count: 5684,
                services_count: 3,
            },
            account: {
                id: 3,
                name: "Timmy (Admin)",
                user_id: 2,
                type: "admin",
                email_owner_id: 1,
                twofa_enabled_at: null,
                twofa_enabled: false,
                lang_id: null,
                currency_id: null,
                country_id: null,
                region_id: null,
                is_flagged: false,
                status: "active",
                balance: 0,
                image_url: null,
                created_at: "2026-03-20T18:24:50.000000Z",
                updated_at: "2026-03-20T18:24:50.000000Z",
                deleted_at: null,
                email: "timmyokpako@gmail.com",
                alias: "Timmy (Admin)",
                kyc_level: 1,
                lang: null,
                country: null,
                permissions: [],
                phones: [],
                kyc_list: [],
                addresses: [],
            },
        },
    },
} as const;

describe("useOrderFlow initialize payload integration (Instagram)", () => {
    it("initializes and supports visibility, tag selection, quantity snapshot, and rehydrate", async () => {
        let flow: ReturnType<typeof useOrderFlow> | null = null;

        function Consumer() {
            flow = useOrderFlow();
            return null;
        }

        const app = await mount(
            <OrderFlowProvider>
                <Consumer />
            </OrderFlowProvider>,
        );

        expect(flow).toBeTruthy();
        expect(flow!.ready).toBe(false);

        await act(async () => {
            flow!.initialize(INITIALIZE_PAYLOAD as any);
            await flush();
        });

        expect(flow!.ready).toBe(true);
        expect(flow!.activeTagId).toBe("t:root");
        expect(flow!.visibleGroup?.tagId).toBe("t:root");
        expect(flow!.visibleGroup?.fieldIds ?? []).toEqual([]);
        expectSameMembers(
            flow!.visibleGroup?.childrenTags?.map((tag) => tag.id),
            ["t:1", "t:2"],
        );
        expect(flow!.quantityPreview).toBe(1);
        expectSameMembers(flow!.services, [28]);
        expect(flow!.min).toBe(10);
        expect(flow!.max).toBe(10000000);

        await act(async () => {
            flow!.selectTag("t:1");
            await flush();
        });

        expect(flow!.activeTagId).toBe("t:1");
        expectSameMembers(flow!.visibleGroup?.fieldIds, ["f:1"]);
        expectSameMembers(
            flow!.visibleGroup?.parentTags?.map((tag) => tag.id),
            ["t:root"],
        );
        expectSameMembers(flow!.services, [25]);
        expect(flow!.min).toBe(50);
        expect(flow!.max).toBe(500000);

        const hydratedSnapshot: OrderSnapshot = {
            version: "1",
            mode: "prod",
            builtAt: new Date().toISOString(),
            selection: {
                tag: "t:1",
                buttons: [],
                fields: [{ id: "f:1", type: "number" }],
            },
            inputs: {
                form: { quantity: 120 },
                selections: {},
            },
            quantity: 120,
            quantitySource: {
                kind: "field",
                id: "f:1",
                rule: { valueBy: "value" },
            },
            services: [25],
            min: 50,
            max: 500000,
            serviceMap: { "t:1": [25] },
            meta: {
                schema_version: "1",
                context: {
                    tag: "t:1",
                    constraints: {},
                    nodeContexts: {},
                    policy: {
                        ratePolicy: { kind: "lte_primary", pct: 5 },
                        requireConstraintFit: true,
                    },
                },
            },
        };

        await act(async () => {
            flow!.setSnapshot(hydratedSnapshot);
            await flush();
        });

        expect(flow!.quantityPreview).toBe(120);

        let snap: OrderSnapshot | undefined;
        await act(async () => {
            snap = flow!.buildSnapshot();
            await flush();
        });

        expect(snap).toBeDefined();
        expect(snap!.selection.tag).toBe("t:1");
        expect(snap!.inputs.form.quantity).toBe(120);
        expectSameMembers(snap!.services, [25]);
        expectSameMembers(snap!.serviceMap["t:1"], [25]);

        await act(async () => {
            flow!.reset();
            await flush();
        });

        expect(flow!.activeTagId).toBe("t:root");

        await act(async () => {
            flow!.setSnapshot(snap!);
            await flush();
        });

        expect(flow!.activeTagId).toBe("t:1");
        expect(flow!.quantityPreview).toBe(120);
        expect(flow!.buildSnapshot()?.inputs.form.quantity).toBe(120);

        await act(async () => {
            flow!.selectTag("t:2");
            await flush();
        });

        expect(flow!.activeTagId).toBe("t:2");
        expect(flow!.visibleGroup?.tagId).toBe("t:2");
        expect(flow!.visibleGroup?.fieldIds ?? []).toEqual([]);
        expectSameMembers(flow!.services, []);
        expect(flow!.min).toBe(1);
        expect(flow!.max).toBe(1);

        await app.unmount();
    });
});
