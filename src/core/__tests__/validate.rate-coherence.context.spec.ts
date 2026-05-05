import { describe, expect, it } from "vitest";
import { validate } from "@/core";
import type { DgpServiceMap } from "@/schema/provider";
import type { ServiceProps } from "@/schema";

function svc(id: string | number, rate: number) {
    return { id, rate } as any;
}

function run(props: ServiceProps, serviceMap: DgpServiceMap) {
    return validate(props, {
        serviceMap,
        ratePolicy: { kind: "lte_primary", pct: 5 },
        simulateVisibility: true as any,
        visibilityOnlyEffectfulTriggers: true as any,
    } as any);
}

function coherence(errors: ReturnType<typeof run>) {
    return errors.filter((e) => e.code === "rate_coherence_violation");
}

describe("context-driven rate coherence", () => {
    it("emits when conflicting refs are co-selectable", () => {
        const services: DgpServiceMap = {
            a: svc("a", 100),
            b: svc("b", 80),
            c: svc("c", 70),
        };

        const props: ServiceProps = {
            filters: [{ id: "t", label: "T", includes: ["A"] }],
            fields: [
                { id: "A", type: "select", label: "A", bind_id: "t", button: true },
                { id: "B", type: "select", label: "B", bind_id: "t", button: true, service_id: "b" },
                { id: "C", type: "select", label: "C", bind_id: "t", button: true, service_id: "c" },
            ],
            includes_for_buttons: {
                A: ["B", "C"],
                B: [],
                C: [],
            },
        };

        const out = coherence(run(props, services));
        expect(out.length).toBeGreaterThan(0);
    });

    it("suppresses mutually exclusive conflicting pair", () => {
        const services: DgpServiceMap = {
            b: svc("b", 80),
            c: svc("c", 70),
        };

        const props: ServiceProps = {
            filters: [{ id: "t", label: "T", includes: ["A"] }],
            fields: [
                { id: "A", type: "select", label: "A", bind_id: "t", button: true },
                { id: "B", type: "select", label: "B", bind_id: "t", button: true, service_id: "b" },
                { id: "C", type: "select", label: "C", bind_id: "t", button: true, service_id: "c" },
            ],
            includes_for_buttons: { A: ["B", "C"], B: [], C: [] },
            excludes_for_buttons: { B: ["C"], C: ["B"] },
        };

        const out = coherence(run(props, services));
        expect(out).toEqual([]);
    });

    it("still reports conflicts from other coexisting refs when one pair is partially excluded", () => {
        const services: DgpServiceMap = {
            b: svc("b", 80),
            c: svc("c", 70),
            e: svc("e", 60),
            f: svc("f", 50),
        };

        const props: ServiceProps = {
            filters: [{ id: "t", label: "T", includes: ["A"] }],
            fields: [
                { id: "A", type: "select", label: "A", bind_id: "t", button: true },
                { id: "B", type: "select", label: "B", bind_id: "t", button: true, service_id: "b" },
                { id: "C", type: "select", label: "C", bind_id: "t", button: true, service_id: "c" },
                { id: "E", type: "select", label: "E", bind_id: "t", button: true, service_id: "e" },
                { id: "F", type: "select", label: "F", bind_id: "t", button: true, service_id: "f" },
            ],
            includes_for_buttons: { A: ["B", "C", "E", "F"], B: [], C: [], E: [], F: [] },
            excludes_for_buttons: { B: ["C"] },
        };

        const out = coherence(run(props, services));
        expect(out.length).toBeGreaterThan(0);
        expect(out.some((e) => (e.details as any)?.candidate?.nodeId === "E")).toBe(true);
    });

    it("does not emit false conflicts when incompatible alternatives are mutually exclusive", () => {
        const services: DgpServiceMap = {
            b: svc("b", 80),
            c: svc("c", 70),
            e: svc("e", 60),
            f: svc("f", 50),
        };
        const props: ServiceProps = {
            filters: [{ id: "t", label: "T", includes: ["A"] }],
            fields: [
                { id: "A", type: "select", label: "A", bind_id: "t", button: true },
                { id: "B", type: "select", label: "B", bind_id: "t", button: true, service_id: "b" },
                { id: "C", type: "select", label: "C", bind_id: "t", button: true, service_id: "c" },
                { id: "E", type: "select", label: "E", bind_id: "t", button: true, service_id: "e" },
                { id: "F", type: "select", label: "F", bind_id: "t", button: true, service_id: "f" },
            ],
            includes_for_buttons: { A: ["B", "C", "E", "F"], B: [], C: [], E: [], F: [] },
            excludes_for_buttons: {
                B: ["C", "E", "F"],
                C: ["B", "E", "F"],
                E: ["B", "C", "F"],
                F: ["B", "C", "E"],
            },
        };
        expect(coherence(run(props, services))).toEqual([]);
    });

    it("selected service overrides tag default primary", () => {
        const services: DgpServiceMap = {
            t: svc("t", 100),
            o: svc("o", 95),
        };
        const props: ServiceProps = {
            filters: [{ id: "t", label: "T", service_id: "t", includes: ["A"] }],
            fields: [
                {
                    id: "A",
                    type: "select",
                    label: "A",
                    bind_id: "t",
                    options: [{ id: "opt", label: "Opt", service_id: "o", pricing_role: "base" }],
                },
            ],
            includes_for_buttons: { opt: [] },
        };

        const out = coherence(run(props, services));
        expect(out).toEqual([]);
    });

    it("ignores utility service refs and uses option.id selected keys", () => {
        const services: DgpServiceMap = {
            t: svc("t", 100),
            b: svc("b", 80),
            u: svc("u", 1),
        };
        const props: ServiceProps = {
            filters: [{ id: "t", label: "T", service_id: "t", includes: ["pick"] }],
            fields: [
                {
                    id: "pick",
                    type: "select",
                    label: "Pick",
                    bind_id: "t",
                    options: [{ id: "showB", label: "Show B" }],
                },
                { id: "B", type: "select", label: "B", bind_id: "t", button: true, service_id: "b" },
                {
                    id: "U",
                    type: "select",
                    label: "U",
                    bind_id: "t",
                    options: [{ id: "u1", label: "U1", service_id: "u", pricing_role: "utility" }],
                },
            ],
            includes_for_buttons: { showB: ["B", "U"] },
        };

        const out = coherence(run(props, services));
        expect(out.some((e) => (e.details as any)?.selectedKeys?.includes("showB"))).toBe(true);
        expect(out.some((e) => (e.details as any)?.candidate?.serviceId === "u")).toBe(false);
    });

    it("includes affectedIds and affectedServiceIds on contextual violations", () => {
        const services: DgpServiceMap = {
            a: svc("a", 100),
            b: svc("b", 80),
            c: svc("c", 70),
        };
        const props: ServiceProps = {
            filters: [{ id: "t", label: "T", includes: ["A"] }],
            fields: [
                { id: "A", type: "select", label: "A", bind_id: "t", button: true },
                { id: "B", type: "select", label: "B", bind_id: "t", button: true, service_id: "b" },
                { id: "C", type: "select", label: "C", bind_id: "t", button: true, service_id: "c" },
            ],
            includes_for_buttons: { A: ["B", "C"] },
        };

        const out = coherence(run(props, services));
        expect(out.length).toBeGreaterThan(0);
        expect(
            out.every(
                (e) =>
                    Array.isArray((e.details as any)?.affectedIds) &&
                    ((e.details as any)?.affectedIds?.length ?? 0) > 0 &&
                    Array.isArray((e.details as any)?.affectedServiceIds),
            ),
        ).toBe(true);
    });

    it("preserves internal_field compatibility with affectedIds metadata", () => {
        const services: DgpServiceMap = {
            a: svc("a", 100),
            b: svc("b", 40),
            c: svc("c", 40),
        };
        const props: ServiceProps = {
            filters: [{ id: "t", label: "T" }],
            fields: [
                {
                    id: "m",
                    type: "multiselect",
                    label: "M",
                    bind_id: "t",
                    options: [
                        { id: "ma", label: "MA", pricing_role: "base", service_id: "a" },
                        { id: "mb", label: "MB", pricing_role: "base", service_id: "b" },
                        { id: "mc", label: "MC", pricing_role: "base", service_id: "c" },
                    ],
                },
            ],
        };

        const out = run(props, services).filter(
            (e) =>
                e.code === "rate_coherence_violation" &&
                (e.details as any)?.kind === "internal_field",
        );
        expect(out.length).toBeGreaterThan(0);
        expect(
            out.every(
                (e) =>
                    Array.isArray((e.details as any)?.affectedIds) &&
                    ((e.details as any)?.affectedIds?.length ?? 0) > 0,
            ),
        ).toBe(true);
    });
});
