// src/core/validate/steps/rates.ts
import type { ValidationCtx } from "../shared";
import { isServiceIdRef, withAffected } from "../shared";
import { isMultiField } from "@/utils";
import {
    getServiceCapability,
    normalizeRatePolicy,
    passesRatePolicy,
} from "@/utils/util";

export function validateRates(v: ValidationCtx): void {
    const ratePolicy = normalizeRatePolicy(
        v.options.fallbackSettings?.ratePolicy,
    );

    for (const f of v.fields) {
        if (!isMultiField(f)) continue;

        const baseRates: Array<{ optionId: string; serviceId: string; rate: number }> =
            [];

        for (const o of f.options ?? []) {
            const role: string = o.pricing_role ?? f.pricing_role ?? "base";
            if (role !== "base") continue;

            const sid: unknown = o.service_id;
            if (!isServiceIdRef(sid)) continue;

            const cap = getServiceCapability(v.serviceMap, sid);
            const rate = cap?.rate;
            if (typeof rate === "number" && Number.isFinite(rate)) {
                baseRates.push({
                    optionId: o.id,
                    serviceId: String(sid),
                    rate,
                });
            }
        }

        if (baseRates.length <= 1) continue;

        const primary = baseRates.reduce((best, current) =>
            current.rate > best.rate ? current : best,
        );

        const offenders = baseRates.filter(
            (candidate) =>
                candidate.optionId !== primary.optionId &&
                !passesRatePolicy(ratePolicy, primary.rate, candidate.rate),
        );

        if (offenders.length > 0) {
            v.invalidRateFieldIds.add(f.id);
            const affectedIds: string[] = [
                f.id,
                ...baseRates.map((entry) => entry.optionId),
            ];

            v.errors.push({
                code: "rate_mismatch_across_base",
                severity: "error",
                message: `Base options under field "${f.id}" violate rate policy "${ratePolicy.kind}".`,
                nodeId: f.id,
                details: withAffected(
                    {
                        fieldId: f.id,
                        policy: ratePolicy.kind,
                        policyPct: "pct" in ratePolicy ? ratePolicy.pct : undefined,
                        primaryOptionId: primary.optionId,
                        primaryRate: primary.rate,
                        rates: baseRates.map((entry) => entry.rate),
                        optionIds: baseRates.map((entry) => entry.optionId),
                        offenderOptionIds: offenders.map((entry) => entry.optionId),
                    },
                    affectedIds.length > 1 ? affectedIds : undefined,
                ),
            });
        }
    }
}
