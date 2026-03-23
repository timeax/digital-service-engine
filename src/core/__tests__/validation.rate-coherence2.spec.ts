import { describe, expect, it } from "vitest";
import { Builder, createBuilder, validate, validateRateCoherenceDeep } from "@/core";
import type { DgpServiceMap } from "@/schema/provider";
import type { ServiceProps } from "@/schema";

function svc(id: string | number, rate: number) {
    return { id, rate };
}

function makeBuilder(props: ServiceProps, services: DgpServiceMap): Builder {
    const builder = createBuilder({ serviceMap: services });
    builder.load(props);
    return builder;
}

function contextual(diags: ReturnType<typeof validateRateCoherenceDeep>) {
    return diags.filter(
        (diag): diag is Extract<(typeof diags)[number], { kind: "contextual" }> =>
            diag.kind === "contextual",
    );
}

describe("validateRateCoherenceDeep", () => {
    it("eq_primary passes only on exact equality", () => {
        const services: DgpServiceMap = {
            a: svc("a", 100),
            b: svc("b", 100),
            c: svc("c", 101),
        };

        const props: ServiceProps = {
            schema_version: "1.0",
            filters: [{ id: "t:root", label: "Root" }],
            fields: [
                {
                    id: "f:a",
                    type: "select",
                    label: "A",
                    bind_id: "t:root",
                    options: [{ id: "o:a", label: "100", pricing_role: "base", service_id: "a" }],
                },
                {
                    id: "f:b",
                    type: "select",
                    label: "B",
                    bind_id: "t:root",
                    options: [{ id: "o:b", label: "100", pricing_role: "base", service_id: "b" }],
                },
                {
                    id: "f:c",
                    type: "select",
                    label: "C",
                    bind_id: "t:root",
                    options: [{ id: "o:c", label: "101", pricing_role: "base", service_id: "c" }],
                },
            ],
        };

        const diags = contextual(
            validateRateCoherenceDeep({
                builder: makeBuilder(props, services),
                services,
                tagId: "t:root",
                ratePolicy: { kind: "eq_primary" },
            }),
        );

        expect(diags.some((diag) => diag.offender.service_id === "a")).toBe(true);
        expect(diags.some((diag) => diag.offender.service_id === "b")).toBe(true);
        expect(diags.some((diag) => diag.offender.service_id === "c")).toBe(false);
    });

    it("bounded lte_primary uses the highest visible single-select candidate as primary and rejects values too far below it", () => {
        const services: DgpServiceMap = {
            100: svc(100, 100),
            96: svc(96, 96),
            80: svc(80, 80),
        };

        const props: ServiceProps = {
            schema_version: "1.0",
            filters: [{ id: "t:root", label: "Root" }],
            fields: [
                {
                    id: "f:primary",
                    type: "select",
                    label: "Primary",
                    bind_id: "t:root",
                    options: [{ id: "o:100", label: "100", pricing_role: "base", service_id: 100 }],
                },
                {
                    id: "f:ok",
                    type: "select",
                    label: "Okay",
                    bind_id: "t:root",
                    options: [{ id: "o:96", label: "96", pricing_role: "base", service_id: 96 }],
                },
                {
                    id: "f:bad",
                    type: "select",
                    label: "Bad",
                    bind_id: "t:root",
                    options: [{ id: "o:80", label: "80", pricing_role: "base", service_id: 80 }],
                },
            ],
        };

        const diags = contextual(
            validateRateCoherenceDeep({
                builder: makeBuilder(props, services),
                services,
                tagId: "t:root",
                ratePolicy: { kind: "lte_primary", pct: 5 },
            }),
        );

        expect(diags.some((diag) => diag.offender.service_id === 80)).toBe(true);
        expect(diags.some((diag) => diag.offender.service_id === 96)).toBe(false);
        expect(diags.every((diag) => diag.primary.service_id === 100)).toBe(true);
    });

    it("single-select fields are evaluated by actual candidate path, not averaged across options", () => {
        const services: DgpServiceMap = {
            100: svc(100, 100),
            190: svc(190, 190),
            200: svc(200, 200),
        };

        const props: ServiceProps = {
            schema_version: "1.0",
            filters: [{ id: "t:root", label: "Root" }],
            fields: [
                {
                    id: "f:single",
                    type: "select",
                    label: "Single",
                    bind_id: "t:root",
                    options: [
                        { id: "o:100", label: "100", pricing_role: "base", service_id: 100 },
                        { id: "o:200", label: "200", pricing_role: "base", service_id: 200 },
                    ],
                },
                {
                    id: "f:peer",
                    type: "select",
                    label: "Peer",
                    bind_id: "t:root",
                    options: [{ id: "o:190", label: "190", pricing_role: "base", service_id: 190 }],
                },
            ],
        };

        const diags = contextual(
            validateRateCoherenceDeep({
                builder: makeBuilder(props, services),
                services,
                tagId: "t:root",
                ratePolicy: { kind: "lte_primary", pct: 5 },
            }),
        );

        expect(diags).toEqual([]);
    });

    it("multi-select uses average for contextual comparison but still reports internal invalid state", () => {
        const services: DgpServiceMap = {
            40: svc(40, 40),
            100: svc(100, 100),
            60: svc(60, 60),
        };

        const props: ServiceProps = {
            schema_version: "1.0",
            filters: [{ id: "t:root", label: "Root" }],
            fields: [
                {
                    id: "f:multi",
                    type: "multiselect",
                    label: "Multi",
                    bind_id: "t:root",
                    options: [
                        { id: "o:40a", label: "40a", pricing_role: "base", service_id: 40 },
                        { id: "o:40b", label: "40b", pricing_role: "base", service_id: 40 },
                        { id: "o:100", label: "100", pricing_role: "base", service_id: 100 },
                    ],
                },
                {
                    id: "f:peer",
                    type: "select",
                    label: "Peer",
                    bind_id: "t:root",
                    options: [{ id: "o:60", label: "60", pricing_role: "base", service_id: 60 }],
                },
            ],
        };

        const diags = validateRateCoherenceDeep({
            builder: makeBuilder(props, services),
            services,
            tagId: "t:root",
            ratePolicy: { kind: "lte_primary", pct: 5 },
            invalidFieldIds: new Set(["f:multi"]),
        });

        expect(diags.some((diag) => diag.kind === "internal_field" && diag.fieldId === "f:multi")).toBe(true);
        expect(contextual(diags)).toEqual([]);
    });

    it("supports string and UUID-like service ids", () => {
        const premiumId = "svc-premium-550e8400-e29b-41d4-a716-446655440000";
        const basicId = "svc-basic-550e8400-e29b-41d4-a716-446655440001";
        const services: DgpServiceMap = {
            [premiumId]: svc(premiumId, 100),
            [basicId]: svc(basicId, 80),
        };

        const props: ServiceProps = {
            schema_version: "1.0",
            filters: [{ id: "t:root", label: "Root" }],
            fields: [
                {
                    id: "f:premium",
                    type: "select",
                    label: "Premium",
                    bind_id: "t:root",
                    options: [{ id: "o:premium", label: "Premium", pricing_role: "base", service_id: premiumId }],
                },
                {
                    id: "f:basic",
                    type: "select",
                    label: "Basic",
                    bind_id: "t:root",
                    options: [{ id: "o:basic", label: "Basic", pricing_role: "base", service_id: basicId }],
                },
            ],
        };

        const diags = contextual(
            validateRateCoherenceDeep({
                builder: makeBuilder(props, services),
                services,
                tagId: "t:root",
                ratePolicy: { kind: "lte_primary", pct: 5 },
            }),
        );

        expect(diags.some((diag) => diag.offender.service_id === basicId)).toBe(true);
    });
});

describe("validate() deep rate coherence integration", () => {
    it("surfaces deep contextual failures with a dedicated validation code", () => {
        const services: DgpServiceMap = {
            100: svc(100, 100),
            80: svc(80, 80),
        };

        const props: ServiceProps = {
            schema_version: "1.0",
            filters: [{ id: "t:root", label: "Root" }],
            fields: [
                {
                    id: "f:a",
                    type: "select",
                    label: "A",
                    bind_id: "t:root",
                    options: [{ id: "o:100", label: "100", pricing_role: "base", service_id: 100 }],
                },
                {
                    id: "f:b",
                    type: "select",
                    label: "B",
                    bind_id: "t:root",
                    options: [{ id: "o:80", label: "80", pricing_role: "base", service_id: 80 }],
                },
            ],
        };

        const errors = validate(props, {
            serviceMap: services,
            fallbackSettings: { ratePolicy: { kind: "lte_primary", pct: 5 } },
        });

        const coherence = errors.find((error) => error.code === "rate_coherence_violation");
        expect(coherence).toBeTruthy();
        expect(coherence?.details?.policy).toBe("lte_primary");
    });
});
