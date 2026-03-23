// src/core/__tests__/fallback-editor.spec.ts
import { describe, expect, it } from "vitest";

import { createFallbackEditor } from "@/core/fallback-editor";
import type {
    Field,
    FieldOption,
    ServiceFlags,
    ServiceProps,
    Tag,
} from "@/schema";
import type { DgpServiceMap } from "@/schema/provider";

const svc = (id: number, rate: number, flags?: ServiceFlags) => ({
    id,
    name: `Service ${id}`,
    rate,
    flags,
});

const serviceMap: DgpServiceMap = {
    "100": svc(100, 10, { dripfeed: { enabled: false, description: "" } }),
    "101": svc(101, 9.8, { dripfeed: { enabled: false, description: "" } }),
    "102": svc(102, 12, { dripfeed: { enabled: false, description: "" } }),
    "103": svc(103, 9.6, { dripfeed: { enabled: true, description: "" } }),
    "104": svc(104, 9.7, { dripfeed: { enabled: false, description: "" } }),
    "105": svc(105, 11, { dripfeed: { enabled: false, description: "" } }),
    "106": svc(106, 9, { dripfeed: { enabled: false, description: "" } }),
    "107": svc(107, 8.8, { dripfeed: { enabled: false, description: "" } }),
};

function baseProps(): ServiceProps {
    const tags: Tag[] = [
        { id: "root", label: "Root" },
        {
            id: "T",
            label: "Group T",
            bind_id: "root",
            service_id: 100,
            constraints: { dripfeed: false },
        },
        {
            id: "T1",
            label: "T1",
            bind_id: "root",
            constraints: { dripfeed: false },
        },
        {
            id: "T2",
            label: "T2",
            bind_id: "root",
            constraints: { dripfeed: true },
        },
    ];

    const fields: Field[] = [
        {
            id: "F_T",
            type: "select",
            label: "F_T",
            bind_id: "T",
            options: [
                {
                    id: "optA",
                    label: "A",
                    service_id: 105,
                    pricing_role: "base",
                } as FieldOption,
            ],
            pricing_role: "base",
        },
        {
            id: "F_M",
            type: "select",
            label: "F_M",
            bind_id: ["T1", "T2"],
            options: [
                {
                    id: "optM",
                    label: "M",
                    service_id: 106,
                    pricing_role: "base",
                } as FieldOption,
            ],
            pricing_role: "base",
        },
    ];

    return {
        filters: tags,
        fields,
        schema_version: "1.0",
        fallbacks: {
            nodes: {
                T: [101, 102, 103],
                optA: [104],
                optM: [107, 102],
            },
            global: {
                100: [104, 102],
            },
        },
    };
}

describe("fallback-editor", () => {
    it("get(serviceId) returns both global and node registrations for the same primary", () => {
        const props = baseProps();
        const editor = createFallbackEditor({
            fallbacks: props.fallbacks,
            props,
            services: serviceMap,
        });

        const regs = editor.get(100);

        expect(regs).toEqual(
            expect.arrayContaining([
                {
                    scope: "global",
                    primary: "100",
                    services: [104, 102],
                },
                {
                    scope: "node",
                    scopeId: "T",
                    primary: 100,
                    services: [101, 102, 103],
                },
            ]),
        );
    });

    it("get(serviceId) returns only global registrations when props are absent", () => {
        const editor = createFallbackEditor({
            fallbacks: {
                global: { 100: [104, 102] },
                nodes: { T: [101] },
            },
            services: serviceMap,
        });

        expect(editor.get(100)).toEqual([
            {
                scope: "global",
                primary: "100",
                services: [104, 102],
            },
        ]);
    });

    it("getScope() returns exact raw scope values", () => {
        const props = baseProps();
        const editor = createFallbackEditor({
            fallbacks: props.fallbacks,
            props,
            services: serviceMap,
        });

        expect(editor.getScope({ scope: "global", primary: 100 })).toEqual([
            104, 102,
        ]);
        expect(editor.getScope({ scope: "node", nodeId: "T" })).toEqual([
            101, 102, 103,
        ]);
    });

    it("check(node scope) rejects a rate-violating candidate", () => {
        const props = baseProps();
        const editor = createFallbackEditor({
            fallbacks: props.fallbacks,
            props,
            services: serviceMap,
            settings: {
                requireConstraintFit: true,
                ratePolicy: { kind: "lte_primary", pct: 5 },
            },
        });

        const checked = editor.check(
            { scope: "node", nodeId: "T" },
            [101, 102],
        );

        expect(checked.allowed).toContain(101);
        expect(checked.rejected).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    candidate: 102,
                    reasons: expect.arrayContaining(["rate_violation"]),
                }),
            ]),
        );
    });

    it("check(node scope) returns missing_service_props when props are absent", () => {
        const editor = createFallbackEditor({
            fallbacks: {
                nodes: { T: [101, 102] },
            },
            services: serviceMap,
        });

        const checked = editor.check(
            { scope: "node", nodeId: "T" },
            [101, 102],
        );

        expect(checked.allowed).toEqual([]);
        expect(checked.warnings).toContain("missing_service_props");
        expect(checked.rejected).toEqual([
            { candidate: 101, ok: false, reasons: ["missing_service_props"] },
            { candidate: 102, ok: false, reasons: ["missing_service_props"] },
        ]);
    });

    it("check(global scope) still supports minimal validation without props", () => {
        const editor = createFallbackEditor({
            fallbacks: {
                global: { 100: [101, 100, 102] },
            },
            services: serviceMap,
        });

        const checked = editor.check(
            { scope: "global", primary: 100 },
            [101, 100, 102],
        );

        expect(checked.primary).toBe(100);
        expect(checked.allowed).toEqual([101, 102]);
        expect(checked.rejected).toEqual([
            { candidate: 100, ok: false, reasons: ["self_reference"] },
        ]);
    });

    it("replace(strict) keeps only allowed candidates", () => {
        const props = baseProps();
        const editor = createFallbackEditor({
            fallbacks: props.fallbacks,
            props,
            services: serviceMap,
            settings: {
                requireConstraintFit: true,
                ratePolicy: { kind: "lte_primary", pct: 5 },
            },
        });

        const next = editor.replace(
            { scope: "node", nodeId: "T" },
            [101, 102, 103],
            { strict: true },
        );

        expect(next.current.nodes?.T).toEqual([101, 103]);
    });

    it("replace(non-strict) preserves normalized list even if some candidates fail", () => {
        const props = baseProps();
        const editor = createFallbackEditor({
            fallbacks: props.fallbacks,
            props,
            services: serviceMap,
            settings: {
                requireConstraintFit: true,
                ratePolicy: { kind: "lte_primary", pct: 5 },
            },
        });

        const next = editor.replace(
            { scope: "node", nodeId: "T" },
            [101, 102, 103, 101],
            { strict: false },
        );

        expect(next.current.nodes?.T).toEqual([101, 102, 103]);
    });

    it("addMany() dedupes and preserves insertion order", () => {
        const props = baseProps();
        const editor = createFallbackEditor({
            fallbacks: {
                global: { 100: [104] },
            },
            props,
            services: serviceMap,
        });

        const next = editor.addMany(
            { scope: "global", primary: 100 },
            [102, 104, 101],
        );

        expect(next.current.global?.["100"]).toEqual([104, 102, 101]);
    });

    it("remove() removes only the requested candidate", () => {
        const props = baseProps();
        const editor = createFallbackEditor({
            fallbacks: {
                global: { 100: [104, 102, 101] },
            },
            props,
            services: serviceMap,
        });

        const next = editor.remove({ scope: "global", primary: 100 }, 102);

        expect(next.current.global?.["100"]).toEqual([104, 101]);
    });

    it("clear() removes an empty scope bucket", () => {
        const props = baseProps();
        const editor = createFallbackEditor({
            fallbacks: {
                nodes: { T: [101] },
            },
            props,
            services: serviceMap,
        });

        const next = editor.clear({ scope: "node", nodeId: "T" });

        expect(next.current.nodes?.T).toBeUndefined();
    });

    it("eligible(node scope) delegates to core fallback eligibility", () => {
        const props = baseProps();
        const editor = createFallbackEditor({
            fallbacks: props.fallbacks,
            props,
            services: serviceMap,
            settings: {
                requireConstraintFit: true,
                ratePolicy: { kind: "lte_primary", pct: 5 },
                selectionStrategy: "priority",
            },
        });

        const eligible = editor.eligible({ scope: "node", nodeId: "T" });

        expect(eligible).toContain(101);
        expect(eligible).not.toContain(102);
    });

    it("state() tracks changed status and reset() restores original fallbacks", () => {
        const props = baseProps();
        const editor = createFallbackEditor({
            fallbacks: props.fallbacks,
            props,
            services: serviceMap,
        });

        expect(editor.state().changed).toBe(false);

        editor.add({ scope: "global", primary: 100 }, 101);
        expect(editor.state().changed).toBe(true);

        const reset = editor.reset();
        expect(reset.changed).toBe(false);
        expect(reset.current).toEqual(props.fallbacks);
    });
});
