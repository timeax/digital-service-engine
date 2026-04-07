import { describe, expect, it } from "vitest";

import { getAssignedServiceIds, getEligibleFallbacks } from "@/core/fallback";
import { getServices } from "@/core/test-services";
import type { ServiceIdRef, ServiceProps } from "@/schema";

const services = getServices();

function createProps(overrides?: Partial<ServiceProps>): ServiceProps {
    return {
        schema_version: "1.0",
        filters: [],
        fields: [],
        ...overrides,
    };
}

function getQuickAddEligible(
    primary: ServiceIdRef,
    options?: {
        props?: ServiceProps;
        exclude?: ServiceIdRef[];
        source?: "all_services" | "registered";
        fallbacks?: ServiceProps["fallbacks"];
    },
): ServiceIdRef[] {
    const props = options?.props ?? createProps();

    return getEligibleFallbacks({
        primary,
        services,
        props,
        exclude: options?.exclude,
        source: options?.source ?? "all_services",
        fallbacks: options?.fallbacks,
        unique: true,
        settings: {
            requireConstraintFit: true,
            ratePolicy: { kind: "lte_primary", pct: 5 },
            selectionStrategy: "priority",
        },
    });
}

describe("getEligibleFallbacks() fixture alias discovery", () => {
    it("keeps registered-list filtering working when source is registered", () => {
        const eligible = getQuickAddEligible(7452, {
            source: "registered",
            fallbacks: {
                global: {
                    "7452": ["4302", "1174"],
                },
            },
        });

        expect(eligible).toEqual(["4302"]);
    });

    it("discovers candidates for fixture service 1185 from the loaded service pool", () => {
        const eligible = getQuickAddEligible(1185);

        expect(eligible).not.toEqual([]);
        expect(eligible).toContain("4302");
    });

    it("treats 1185, 7452, and '7452' as the same primary service", () => {
        const fromAliasId = getQuickAddEligible(1185);
        const fromCanonicalNumber = getQuickAddEligible(7452);
        const fromCanonicalString = getQuickAddEligible("7452");

        expect(fromAliasId).toEqual(fromCanonicalNumber);
        expect(fromAliasId).toEqual(fromCanonicalString);
    });

    it("never returns the canonical primary candidate when the input primary is alias 1185", () => {
        const eligible = getQuickAddEligible(1185);

        expect(eligible).not.toContain("7452");
        expect(eligible).not.toContain(1185);
    });

    it("excludes assigned aliases when props contribute provider-row ids", () => {
        const assignedProps = createProps({
            filters: [
                {
                    id: "assigned-targeted",
                    label: "Assigned targeted service",
                    service_id: 1185,
                },
            ],
        });

        const baseline = getQuickAddEligible("3244");
        const assignedEligible = getQuickAddEligible("3244", {
            props: assignedProps,
            exclude: getAssignedServiceIds({ props: assignedProps }),
        });

        expect(baseline).toContain("7452");
        expect(assignedEligible).not.toContain("7452");
    });

    it("still respects current rate policy when discovering from all services", () => {
        const eligible = getQuickAddEligible(7452);

        expect(eligible).not.toContain("1174");
    });
});
