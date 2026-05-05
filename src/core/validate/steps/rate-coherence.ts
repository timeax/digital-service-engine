import type { Field, PricingRole, ServiceIdRef, Tag } from "@/schema";
import type { ValidationCtx } from "../shared";
import { getServiceCapability, normalizeRatePolicy, passesRatePolicy } from "@/utils/util";
import {
    buildTriggerEffectMap,
    isRefExcludedBySelectedKeys,
    type TriggerEffectMap,
} from "@/core/rate-coherence";

type RateContextServiceRef = {
    key: string;
    nodeId: string;
    fieldId: string;
    nodeKind: "button" | "option";
    serviceId: ServiceIdRef;
    rate: number;
    label?: string;
    pricingRole: "base" | "utility";
};

type RateContextTagDefaultRef = {
    key: string;
    nodeId: string;
    nodeKind: "tag";
    serviceId: ServiceIdRef;
    rate: number;
    label?: string;
    pricingRole: "base";
};

function normalizeRole(role: PricingRole | undefined, fallback: PricingRole): PricingRole {
    return role === "base" || role === "utility" ? role : fallback;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
    const out = new Set<string>();
    for (const value of values) {
        if (!value) continue;
        out.add(value);
    }
    return Array.from(out);
}

function getRate(serviceMap: ValidationCtx["serviceMap"], serviceId: ServiceIdRef): number | undefined {
    const cap = getServiceCapability(serviceMap, serviceId);
    const rate = cap?.rate;
    if (typeof rate !== "number" || !Number.isFinite(rate)) return undefined;
    return rate;
}

function collectContextRefs(
    tag: Tag,
    visibleFields: Field[],
    serviceMap: ValidationCtx["serviceMap"],
): {
    tagDefault?: RateContextTagDefaultRef;
    serviceRefs: RateContextServiceRef[];
} {
    const serviceRefs: RateContextServiceRef[] = [];

    let tagDefault: RateContextTagDefaultRef | undefined;
    if (tag.service_id !== undefined && tag.service_id !== null) {
        const tagRate = getRate(serviceMap, tag.service_id);
        if (tagRate != null) {
            tagDefault = {
                key: tag.id,
                nodeId: tag.id,
                nodeKind: "tag",
                serviceId: tag.service_id,
                rate: tagRate,
                label: tag.label ?? tag.id,
                pricingRole: "base",
            };
        }
    }

    for (const field of visibleFields) {
        const fieldRole = normalizeRole(field.pricing_role, "base");

        if (field.service_id !== undefined && field.service_id !== null) {
            const rate = getRate(serviceMap, field.service_id);
            if (rate != null) {
                serviceRefs.push({
                    key: field.id,
                    nodeId: field.id,
                    fieldId: field.id,
                    nodeKind: "button",
                    serviceId: field.service_id,
                    rate,
                    label: field.label ?? field.id,
                    pricingRole: fieldRole,
                });
            }
        }

        for (const option of field.options ?? []) {
            if (option.service_id === undefined || option.service_id === null) continue;
            const rate = getRate(serviceMap, option.service_id);
            if (rate == null) continue;

            serviceRefs.push({
                key: option.id,
                nodeId: option.id,
                fieldId: field.id,
                nodeKind: "option",
                serviceId: option.service_id,
                rate,
                label: option.label ?? option.id,
                pricingRole: normalizeRole(option.pricing_role ?? field.pricing_role, "base"),
            });
        }
    }

    return { tagDefault, serviceRefs };
}

function pickHighestRatePrimary(refs: RateContextServiceRef[]): RateContextServiceRef | undefined {
    return refs.reduce<RateContextServiceRef | undefined>((best, cur) => {
        if (!best) return cur;
        if (cur.rate > best.rate) return cur;
        if (cur.rate < best.rate) return best;
        return cur.nodeId < best.nodeId ? cur : best;
    }, undefined);
}

export function validateRateCoherenceForVisibleContext(params: {
    v: ValidationCtx;
    tagId: string;
    selectedKeys: readonly string[];
    visibleFieldIds: readonly string[];
    effectMap: TriggerEffectMap;
    seen: Set<string>;
}): void {
    const { v, tagId, selectedKeys, visibleFieldIds, effectMap, seen } = params;
    const tag = v.tagById.get(tagId);
    if (!tag) return;

    const visibleFields = visibleFieldIds
        .map((id) => v.fieldById.get(id))
        .filter(Boolean) as Field[];

    const { tagDefault, serviceRefs: allServiceRefs } = collectContextRefs(
        tag,
        visibleFields,
        v.serviceMap,
    );

    const baseRefs = allServiceRefs.filter((ref) => ref.pricingRole === "base");
    if (baseRefs.length === 0 && !tagDefault) return;

    const ratePolicy = normalizeRatePolicy(v.options.ratePolicy);
    const visibleInvalidFieldIds = visibleFieldIds.filter((fieldId) =>
        v.invalidRateFieldIds.has(fieldId),
    );

    for (const fieldId of visibleInvalidFieldIds) {
        const internalKey = [
            "rate-coherence-internal",
            tagId,
            [...selectedKeys].sort().join("|"),
            fieldId,
        ].join("::");
        if (seen.has(internalKey)) continue;
        seen.add(internalKey);

        v.errors.push({
            code: "rate_coherence_violation",
            severity: "error",
            nodeId: fieldId,
            message: `Field "${fieldId}" is internally invalid under rate policy "${ratePolicy.kind}".`,
            details: {
                kind: "internal_field",
                tagId,
                selectedKeys: [...selectedKeys],
                visibleFieldIds: [...visibleFieldIds],
                fieldId,
                invalidFieldIds: [fieldId],
                affectedIds: uniqueStrings([tagId, ...selectedKeys, fieldId]),
            },
        });
    }

    const selectedSet = new Set(selectedKeys);
    const selectedServiceRefs = baseRefs.filter((ref) => selectedSet.has(ref.key));

    if (baseRefs.length === 0) return;

    for (let i = 0; i < baseRefs.length; i++) {
        for (let j = i + 1; j < baseRefs.length; j++) {
            const left = baseRefs[i]!;
            const right = baseRefs[j]!;

            const hypotheticalKeys = [...selectedKeys, left.key, right.key];
            const survivingRefs = baseRefs.filter(
                (ref) =>
                    !isRefExcludedBySelectedKeys(
                        { fieldId: ref.fieldId, nodeId: ref.nodeId },
                        hypotheticalKeys,
                        effectMap,
                    ),
            );

            const survivingSet = new Set(survivingRefs.map((ref) => ref.nodeId));
            if (!survivingSet.has(left.nodeId) || !survivingSet.has(right.nodeId)) {
                continue;
            }
            if (survivingRefs.length <= 1) continue;

            const survivingSelected = survivingRefs.filter((ref) =>
                selectedSet.has(ref.key),
            );
            const tagIsCompeting = survivingSelected.length === 0;

            const primary = pickHighestRatePrimary(survivingRefs);
            if (!primary) continue;

            const comparePool = survivingRefs.filter((ref) => ref.nodeId !== primary.nodeId);
            for (const candidate of comparePool) {
                if (passesRatePolicy(ratePolicy, primary.rate, candidate.rate)) continue;

                const issueKey = [
                    "rate-coherence-context",
                    tagId,
                    [...selectedKeys].sort().join("|"),
                    [...survivingRefs.map((r) => r.nodeId).sort()].join("|"),
                    primary.nodeId,
                    candidate.nodeId,
                    ratePolicy.kind,
                    "pct" in ratePolicy ? String(ratePolicy.pct) : "",
                ].join("::");
                if (seen.has(issueKey)) continue;
                seen.add(issueKey);

                v.errors.push({
                    code: "rate_coherence_violation",
                    severity: "error",
                    nodeId: candidate.nodeId,
                    message: "Visible service context contains incompatible base service rates.",
                    details: {
                        kind: "selected_context",
                        tagId,
                        selectedKeys: [...selectedKeys],
                        visibleFieldIds: [...visibleFieldIds],
                        primary: {
                            nodeId: primary.nodeId,
                            fieldId: primary.fieldId,
                            service_id: primary.serviceId,
                            serviceId: primary.serviceId,
                            rate: primary.rate,
                        },
                        candidate: {
                            nodeId: candidate.nodeId,
                            fieldId: candidate.fieldId,
                            service_id: candidate.serviceId,
                            serviceId: candidate.serviceId,
                            rate: candidate.rate,
                        },
                        policy: ratePolicy.kind,
                        policyPct: "pct" in ratePolicy ? ratePolicy.pct : undefined,
                        invalidFieldIds: visibleInvalidFieldIds,
                        affectedIds: uniqueStrings([
                            tagId,
                            ...selectedKeys,
                            primary.nodeId,
                            primary.fieldId,
                            candidate.nodeId,
                            candidate.fieldId,
                            tagIsCompeting ? tagDefault?.nodeId : undefined,
                        ]),
                        affectedServiceIds: uniqueStrings([
                            String(primary.serviceId),
                            String(candidate.serviceId),
                        ]),
                    },
                });
            }
        }
    }

    if (selectedServiceRefs.length === 0 && tagDefault && baseRefs.length > 0) {
        const survivingByDefault = baseRefs.filter(
            (ref) =>
                !isRefExcludedBySelectedKeys(
                    { fieldId: ref.fieldId, nodeId: ref.nodeId },
                    selectedKeys,
                    effectMap,
                ),
        );

        for (const candidate of survivingByDefault) {
            if (passesRatePolicy(ratePolicy, tagDefault.rate, candidate.rate)) continue;

            const issueKey = [
                "rate-coherence-default",
                tagId,
                [...selectedKeys].sort().join("|"),
                tagDefault.nodeId,
                candidate.nodeId,
                ratePolicy.kind,
                "pct" in ratePolicy ? String(ratePolicy.pct) : "",
            ].join("::");
            if (seen.has(issueKey)) continue;
            seen.add(issueKey);

            v.errors.push({
                code: "rate_coherence_violation",
                severity: "error",
                nodeId: candidate.nodeId,
                message: "Visible service context contains incompatible base service rates.",
                details: {
                    kind: "selected_context",
                    tagId,
                    selectedKeys: [...selectedKeys],
                    visibleFieldIds: [...visibleFieldIds],
                    primary: {
                        nodeId: tagDefault.nodeId,
                        service_id: tagDefault.serviceId,
                        serviceId: tagDefault.serviceId,
                        rate: tagDefault.rate,
                    },
                    candidate: {
                        nodeId: candidate.nodeId,
                        fieldId: candidate.fieldId,
                        service_id: candidate.serviceId,
                        serviceId: candidate.serviceId,
                        rate: candidate.rate,
                    },
                    policy: ratePolicy.kind,
                    policyPct: "pct" in ratePolicy ? ratePolicy.pct : undefined,
                    invalidFieldIds: visibleInvalidFieldIds,
                    affectedIds: uniqueStrings([
                        tagId,
                        ...selectedKeys,
                        tagDefault.nodeId,
                        candidate.nodeId,
                        candidate.fieldId,
                    ]),
                    affectedServiceIds: uniqueStrings([
                        String(tagDefault.serviceId),
                        String(candidate.serviceId),
                    ]),
                },
            });
        }
    }
}

export function validateRateCoherence(v: ValidationCtx): void {
    if (Object.keys(v.serviceMap).length === 0 || v.tags.length === 0) return;
    const effectMap = buildTriggerEffectMap(v.props);
    const seen = new Set<string>();

    for (const context of v.simulatedVisibilityContexts) {
        validateRateCoherenceForVisibleContext({
            v,
            tagId: context.tagId,
            selectedKeys: context.selectedKeys,
            visibleFieldIds: context.visibleFieldIds,
            effectMap,
            seen,
        });
    }
}
