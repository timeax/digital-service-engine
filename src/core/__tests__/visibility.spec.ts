// src/core/__tests__/visibility.test.ts
import { describe, expect, it } from "vitest";
import { visibleFieldIdsUnder } from "../visibility";
import type { ServiceProps } from "@/schema";

function makeProps(): ServiceProps {
    return {
        name: "CoinMarketCap Followers [Max: 1M] [Start Time: 0 - 24 Hours] [Refill: 30D] [Speed: Up to 50K/D]",
        filters: [
            {
                id: "t:root",
                label: "Root",
                service_id: 10110,
            },
        ],
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
                },
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
        ],
        includes_for_buttons: {
            "f:dripfeed": ["f:runs", "f:interval"],
        },
        schema_version: "jap.service-props.v1",
        fingerprint: "sp_1u5kn771p91g",
        is_exported: false,
    } as unknown as ServiceProps;
}

describe("visibleFieldIdsUnder", () => {
    it("base visibility (no selection) shows only lineage-bound fields in props.fields order", () => {
        const props = makeProps();

        const ids = visibleFieldIdsUnder(props, "t:root", {
            selectedKeys: new Set(),
        });

        // only the bound-to-root fields are visible
        expect(ids).toEqual(["f:link", "f:quantity", "f:dripfeed"]);
    });

    it("EXPECTED per your rule: revealed fields should respect props.fields order (i.e. appear after earlier fields)", () => {
        const props = makeProps();

        const ids = visibleFieldIdsUnder(props, "t:root", {
            selectedKeys: new Set(["f:dripfeed"]),
        });

        // This is the ordering you said you expect:
        // - preserve natural order from props.fields (unless order_for_tags says otherwise)
        expect(ids).toEqual([
            "f:link",
            "f:quantity",
            "f:dripfeed",
            "f:runs",
            "f:interval",
        ]);
    });

    it("If order_for_tags is present, it pins those ids first (current implementation behavior)", () => {
        const props = makeProps();

        // example pinning: keep base fields first, then revealed
        (props as any).order_for_tags = {
            "t:root": [
                "f:dripfeed",
                "f:link",
                "f:quantity",
                "f:runs",
                "f:interval",
            ],
        };

        const ids = visibleFieldIdsUnder(props, "t:root", {
            // selectedKeys: new Set(["f:dripfeed"]),
        });

        expect(ids).toEqual([
            "f:dripfeed",
            "f:link",
            "f:quantity",
            // "f:runs",
            // "f:interval",
        ]);
    });

    it("If order_for_tags is present, it pins those ids first (current implementation behavior) (VERSION 2)", () => {
        const props = makeProps();

        // example pinning: keep base fields first, then revealed
        (props as any).order_for_tags = {
            "t:root": [
                "f:dripfeed",
                "f:link",
                "f:quantity",
                "f:runs",
                "f:interval",
            ],
        };

        const ids = visibleFieldIdsUnder(props, "t:root", {
            selectedKeys: new Set(["f:dripfeed"]),
        });

        expect(ids).toEqual([
            "f:dripfeed",
            "f:link",
            "f:quantity",
            "f:runs",
            "f:interval",
        ]);
    });
});
