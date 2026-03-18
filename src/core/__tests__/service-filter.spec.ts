import { describe, expect, it } from "vitest";
import { createBuilder } from "@/core";
import { filterServicesForVisibleGroup } from "@/core/service-filter";
import type { ServiceProps } from "@/schema";
import type { DgpServiceMap } from "@/schema/provider";
import type { FallbackSettings } from "@/schema/validation";

function baseProps(): ServiceProps {
    return {
        schema_version: "1.0",
        filters: [{ id: "root", label: "Root" }],
        fields: [],
    };
}

const serviceMap: DgpServiceMap = {
    100: {
        id: 100,
        rate: 10,
        dripfeed: true,
        refill: true,
        cancel: true,
        platform_id: "p1",
        handler_id: "h1",
    },
    101: {
        id: 101,
        rate: 12,
        dripfeed: true,
        refill: true,
        cancel: true,
        platform_id: "p1",
        handler_id: "h1",
    },
    102: {
        id: 102,
        rate: 8,
        dripfeed: true,
        refill: false,
        cancel: true,
        platform_id: "p1",
        handler_id: "h1",
    },
    103: {
        id: 103,
        rate: 9,
        dripfeed: false,
        refill: true,
        cancel: true,
        platform_id: "p1",
        handler_id: "h1",
    },
    104: {
        id: 104,
        rate: 15,
        dripfeed: true,
        refill: true,
        cancel: true,
        platform_id: "p1",
        handler_id: "h1",
    },
    201: {
        id: 201,
        rate: 9,
        dripfeed: true,
        refill: true,
        cancel: true,
        platform_id: "p2",
        handler_id: "h1",
    },
    202: {
        id: 202,
        rate: 9,
        dripfeed: true,
        refill: true,
        cancel: true,
        platform_id: "p1",
        handler_id: "h2",
    },
};

describe("core.filterServicesForVisibleGroup", () => {
    it("excludes used candidates and preserves constraint/rate/policy semantics", () => {
        const b = createBuilder({ serviceMap });
        b.load(baseProps());

        const result = filterServicesForVisibleGroup(
            {
                candidates: [101, 102, 103, 104, 201, 202],
                context: {
                    tagId: "root",
                    usedServiceIds: [100, 101],
                    effectiveConstraints: { dripfeed: true },
                    policies: [
                        {
                            id: "no_mix_platform",
                            scope: "visible_group",
                            subject: "services",
                            op: "no_mix",
                            projection: "service.platform_id",
                            severity: "error",
                        },
                    ],
                    fallback: {
                        ratePolicy: { kind: "lte_primary" },
                    } as FallbackSettings,
                },
            },
            { builder: b },
        );

        const byId = new Map(result.checks.map((c) => [String(c.id), c]));
        expect(byId.has("101")).toBe(false);
        expect(byId.get("102")?.ok).toBe(true);
        expect(byId.get("103")?.reasons).toContain("constraint_mismatch");
        expect(byId.get("104")?.reasons).toContain("rate_policy");
        expect(byId.get("201")?.policyErrors).toContain("no_mix_platform");
        expect(byId.get("202")?.ok).toBe(true);
    });

    it("marks missing capability as not ok", () => {
        const b = createBuilder({ serviceMap });
        b.load(baseProps());

        const result = filterServicesForVisibleGroup(
            {
                candidates: [999],
                context: {
                    tagId: "root",
                    usedServiceIds: [100],
                },
            },
            { builder: b },
        );

        expect(result.checks).toHaveLength(1);
        expect(result.checks[0].ok).toBe(false);
        expect(result.checks[0].reasons).toEqual(["missing_capability"]);
    });

    it("passes rate when there is no primary", () => {
        const b = createBuilder({ serviceMap });
        b.load(baseProps());

        const result = filterServicesForVisibleGroup(
            {
                candidates: [104],
                context: {
                    tagId: "root",
                    usedServiceIds: [],
                    effectiveConstraints: {},
                    policies: [],
                    fallback: { ratePolicy: { kind: "lte_primary" } },
                },
            },
            { builder: b },
        );

        expect(result.checks[0].passesRate).toBe(true);
    });

    it("respects at_least_pct_lower rate policy", () => {
        const b = createBuilder({ serviceMap });
        b.load(baseProps());

        const result = filterServicesForVisibleGroup(
            {
                candidates: [102, 103, 104],
                context: {
                    tagId: "root",
                    usedServiceIds: [100],
                    effectiveConstraints: {},
                    policies: [],
                    fallback: {
                        ratePolicy: { kind: "at_least_pct_lower", pct: 20 },
                    },
                },
            },
            { builder: b },
        );

        const byId = new Map(result.checks.map((c) => [String(c.id), c]));
        expect(byId.get("102")?.passesRate).toBe(true);
        expect(byId.get("103")?.passesRate).toBe(false);
        expect(byId.get("104")?.passesRate).toBe(false);
    });

    it("handles loose policy input and returns diagnostics", () => {
        const b = createBuilder({ serviceMap });
        b.load(baseProps());

        const result = filterServicesForVisibleGroup(
            {
                candidates: [102],
                context: {
                    tagId: "root",
                    usedServiceIds: [100],
                    effectiveConstraints: {},
                    policies: [
                        { subject: "services", scope: "visible_group", op: "all_true" },
                    ],
                    fallback: { ratePolicy: { kind: "lte_primary" } },
                },
            },
            { builder: b },
        );

        expect(result.checks).toHaveLength(1);
        expect(result.checks[0].ok).toBe(true);
        expect(Array.isArray(result.diagnostics)).toBe(true);
        expect((result.diagnostics ?? []).length).toBeGreaterThan(0);
    });

    it("same tag with different selectedButtons can produce different policy outcomes", () => {
        const b = createBuilder({
            serviceMap: {
                100: { id: 100, rate: 10, platform_id: "p1" },
                201: { id: 201, rate: 9, platform_id: "p2" },
                202: { id: 202, rate: 8, platform_id: "p1" },
            } as DgpServiceMap,
        });

        b.load({
            schema_version: "1.0",
            filters: [{ id: "root", label: "Root", service_id: 100 }],
            fields: [
                {
                    id: "f:toggle",
                    type: "checkbox",
                    label: "Toggle",
                    bind_id: "root",
                    button: true,
                },
                {
                    id: "f:hidden",
                    type: "select",
                    label: "Hidden",
                    options: [{ id: "o:hidden", label: "Hidden", service_id: 201 }],
                },
            ],
            includes_for_buttons: {
                "f:toggle": ["f:hidden"],
            },
        } as unknown as ServiceProps);

        const policies = [
            {
                id: "no_mix_platform",
                scope: "visible_group",
                subject: "services",
                op: "no_mix",
                projection: "service.platform_id",
                severity: "error",
            },
        ];

        const withoutSelection = filterServicesForVisibleGroup(
            {
                candidates: [202],
                context: {
                    tagId: "root",
                    selectedButtons: [],
                    usedServiceIds: [100, 201],
                    policies,
                },
            },
            { builder: b },
        );

        const withSelection = filterServicesForVisibleGroup(
            {
                candidates: [202],
                context: {
                    tagId: "root",
                    selectedButtons: ["f:toggle"],
                    usedServiceIds: [100, 201],
                    policies,
                },
            },
            { builder: b },
        );

        expect(withoutSelection.checks[0].passesPolicies).toBe(true);
        expect(withSelection.checks[0].passesPolicies).toBe(false);
    });

    it("selectedButtons precision excludes hidden-service context when not visible", () => {
        const b = createBuilder({
            serviceMap: {
                100: { id: 100, rate: 10, platform_id: "p1" },
                201: { id: 201, rate: 9, platform_id: "p2" },
                202: { id: 202, rate: 8, platform_id: "p1" },
            } as DgpServiceMap,
        });

        b.load({
            schema_version: "1.0",
            filters: [{ id: "root", label: "Root", service_id: 100 }],
            fields: [
                {
                    id: "f:toggle",
                    type: "checkbox",
                    label: "Toggle",
                    bind_id: "root",
                    button: true,
                },
                {
                    id: "f:hidden",
                    type: "select",
                    label: "Hidden",
                    options: [{ id: "o:hidden", label: "Hidden", service_id: 201 }],
                },
            ],
            includes_for_buttons: {
                "f:toggle": ["f:hidden"],
            },
        } as unknown as ServiceProps);

        const policies = [
            {
                id: "no_mix_platform",
                scope: "visible_group",
                subject: "services",
                op: "no_mix",
                projection: "service.platform_id",
                severity: "error",
            },
        ];

        const result = filterServicesForVisibleGroup(
            {
                candidates: [202],
                context: {
                    tagId: "root",
                    selectedButtons: [],
                    usedServiceIds: [100, 201],
                    policies,
                },
            },
            { builder: b },
        );

        expect(result.checks[0].ok).toBe(true);
        expect(result.checks[0].policyErrors).toBeUndefined();
    });
});
