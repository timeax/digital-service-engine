import type {
    DgpServiceCapability,
    DgpServiceMap,
    DynamicRule,
    FallbackSettings,
    Field,
    RatePolicy,
    ServiceIdRef,
} from "@/schema";
import {
    constraintFitOk,
    getServiceCapability,
    normalizeRatePolicy,
    passesRatePolicy,
    toFiniteNumber,
} from "@/utils/util";
import { buildNodeMap } from "@/core/node-map";
import { buildTriggerEffectMap } from "@/core/rate-coherence";
import type { ValidationCtx } from "@/core/validate/shared";
import { validateRateCoherenceForVisibleContext } from "@/core/validate/steps/rate-coherence";
import { compilePolicies, PolicyDiagnostic } from "@/core/policy";
import { Builder } from "@/core/builder";

export type ServiceCheck = {
    id: ServiceIdRef;
    ok: boolean;
    fitsConstraints: boolean;
    passesRate: boolean;
    passesPolicies: boolean;
    policyErrors?: string[];
    policyWarnings?: string[];
    reasons: Array<
        | "constraint_mismatch"
        | "rate_policy"
        | "policy_error"
        | "missing_capability"
    >;
    cap?: DgpServiceCapability;
    rate?: number;
};

export type FilterServicesForVisibleGroupInput = {
    candidates: ServiceIdRef[];
    context: {
        tagId: string;
        selectedButtons?: string[];
        usedServiceIds: ServiceIdRef[];
        effectiveConstraints?: Partial<
            Record<"refill" | "cancel" | "dripfeed", boolean>
        >;
        policies?: unknown;
        ratePolicy?: RatePolicy;
        fallbackSettings?: FallbackSettings;
        /** Backward-compatible alias for fallbackSettings */
        fallback?: FallbackSettings;
        strictSafety?: boolean;
        enforcePolicies?: boolean;
        rateContext?:
            | {
                  mode: "context";
              }
            | {
                  mode: "custom_primary_rate";
                  source: "manual" | "service";
                  primaryRate?: number;
                  primaryServiceId?: ServiceIdRef;
              };
    };
};

export type FilterServicesForVisibleGroupResult = {
    checks: ServiceCheck[];
    diagnostics?: PolicyDiagnostic[];
};

export function filterServicesForVisibleGroup(
    input: FilterServicesForVisibleGroupInput,
    deps: {
        builder: Builder;
    },
): FilterServicesForVisibleGroupResult {
    const svcMap: DgpServiceMap = deps.builder.getServiceMap?.() ?? {};
    const builderOptions = deps.builder.getOptions?.();
    const { context } = input;

    const usedSet = new Set(context.usedServiceIds.map(String));
    const explicitFallbackSettings =
        context.fallbackSettings ?? context.fallback;
    const resolvedRatePolicy = normalizeRatePolicy(
        context.ratePolicy ??
            explicitFallbackSettings?.ratePolicy ??
            builderOptions?.ratePolicy,
    );
    const policySource = context.policies ?? builderOptions?.policies ?? [];
    const resolvedCustomPrimaryRate = resolveCustomPrimaryRate(
        context.rateContext,
        svcMap,
    );

    const visibleServiceIds =
        context.selectedButtons === undefined
            ? undefined
            : collectVisibleServiceIds(
                  deps.builder,
                  context.tagId,
                  context.selectedButtons,
              );

    const checks: ServiceCheck[] = [];
    let lastDiagnostics: PolicyDiagnostic[] | undefined = undefined;

    for (const id of input.candidates) {
        if (usedSet.has(String(id))) continue;

        const cap = getServiceCapability(svcMap, id);
        if (!cap) {
            checks.push({
                id,
                ok: false,
                fitsConstraints: false,
                passesRate: false,
                passesPolicies: false,
                reasons: ["missing_capability"],
            });
            continue;
        }

        const fitsConstraints = constraintFitOk(
            svcMap,
            cap.id,
            context.effectiveConstraints ?? {},
        );

        const passesRate =
            resolvedCustomPrimaryRate != null
                ? passesRatePolicy(
                      resolvedRatePolicy,
                      resolvedCustomPrimaryRate,
                      toFiniteNumber(cap.rate),
                  )
                : candidatePassesRateCoherence(
                      deps.builder,
                      svcMap,
                      context.tagId,
                      context.selectedButtons ?? [],
                      context.usedServiceIds,
                      id,
                      resolvedRatePolicy,
                  );

        const polRes = evaluatePoliciesRaw(
            policySource,
            [...context.usedServiceIds, id],
            svcMap,
            context.tagId,
            visibleServiceIds,
        );
        const passesPolicies = polRes.ok;
        lastDiagnostics = polRes.diagnostics;

        const reasons: ServiceCheck["reasons"] = [];
        if (!fitsConstraints) reasons.push("constraint_mismatch");
        if (!passesRate) reasons.push("rate_policy");
        if (!passesPolicies) reasons.push("policy_error");

        checks.push({
            id,
            ok: fitsConstraints && passesRate && passesPolicies,
            fitsConstraints,
            passesRate,
            passesPolicies,
            policyErrors: polRes.errors.length ? polRes.errors : undefined,
            policyWarnings: polRes.warnings.length
                ? polRes.warnings
                : undefined,
            reasons,
            cap,
            rate: toFiniteNumber(cap.rate),
        });
    }

    return {
        checks,
        diagnostics:
            lastDiagnostics && lastDiagnostics.length
                ? lastDiagnostics
                : undefined,
    };
}

function resolveCustomPrimaryRate(
    rateContext: FilterServicesForVisibleGroupInput["context"]["rateContext"],
    serviceMap: DgpServiceMap,
): number | undefined {
    if (!rateContext || rateContext.mode !== "custom_primary_rate") {
        return undefined;
    }

    if (rateContext.source === "manual") {
        return toFiniteNumber(rateContext.primaryRate);
    }

    if (rateContext.primaryServiceId == null) return undefined;
    const cap = getServiceCapability(serviceMap, rateContext.primaryServiceId);
    return toFiniteNumber(cap?.rate);
}

function evaluatePoliciesRaw(
    raw: unknown,
    serviceIds: ServiceIdRef[],
    svcMap: DgpServiceMap,
    tagId: string,
    visibleServiceIds?: Set<string>,
) {
    const compiled = compilePolicies(raw);
    const evaluated = evaluateServicePolicies(
        compiled.policies,
        serviceIds,
        svcMap,
        tagId,
        visibleServiceIds,
    );
    return {
        ...evaluated,
        diagnostics: compiled.diagnostics,
    };
}

function evaluateServicePolicies(
    rules: DynamicRule[] | undefined,
    svcIds: ServiceIdRef[],
    svcMap: DgpServiceMap,
    tagId: string,
    visibleServiceIds?: Set<string>,
): { ok: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!rules || !rules.length) return { ok: true, errors, warnings };

    const relevant = rules.filter(
        (r) =>
            r.subject === "services" &&
            (r.scope === "visible_group" || r.scope === "global"),
    );

    for (const r of relevant) {
        const scoped = scopeServiceIdsForRule(svcIds, r, visibleServiceIds);
        const ids = scoped.filter((id) =>
            matchesRuleFilter(getServiceCapability(svcMap, id), r, tagId),
        );
        const projection = r.projection || "service.id";
        const values = ids.map((id) =>
            policyProjectValue(getServiceCapability(svcMap, id), projection),
        );

        let ok = true;
        switch (r.op) {
            case "all_equal":
                ok = values.length <= 1 || values.every((v) => v === values[0]);
                break;
            case "unique": {
                const uniq = new Set(values.map((v) => String(v)));
                ok = uniq.size === values.length;
                break;
            }
            case "no_mix": {
                const uniq = new Set(values.map((v) => String(v)));
                ok = uniq.size <= 1;
                break;
            }
            case "all_true":
                ok = values.every((v) => !!v);
                break;
            case "any_true":
                ok = values.some((v) => !!v);
                break;
            case "max_count": {
                const n = typeof r.value === "number" ? r.value : NaN;
                ok = Number.isFinite(n) ? values.length <= n : true;
                break;
            }
            case "min_count": {
                const n = typeof r.value === "number" ? r.value : NaN;
                ok = Number.isFinite(n) ? values.length >= n : true;
                break;
            }
            default:
                ok = true;
        }

        if (!ok) {
            if ((r.severity ?? "error") === "error") {
                errors.push(r.id ?? "policy_error");
            } else {
                warnings.push(r.id ?? "policy_warning");
            }
        }
    }

    return { ok: errors.length === 0, errors, warnings };
}

function scopeServiceIdsForRule(
    serviceIds: (string | number)[],
    rule: DynamicRule,
    visibleServiceIds?: Set<string>,
): ServiceIdRef[] {
    if (rule.scope !== "visible_group" || !visibleServiceIds) return serviceIds;
    return serviceIds.filter((id) => visibleServiceIds.has(String(id)));
}

function collectVisibleServiceIds(
    builder: Builder,
    tagId: string,
    selectedButtons: string[],
): Set<string> {
    const out = new Set<string>();
    const props = builder.getProps();
    const tags = props.filters ?? [];
    const fields = props.fields ?? [];

    const tag = tags.find((t) => t.id === tagId);
    if (tag?.service_id != null) out.add(String(tag.service_id));

    const visibleFieldIds = new Set(
        builder.visibleFields(tagId, selectedButtons),
    );
    for (const field of fields) {
        if (!visibleFieldIds.has(field.id)) continue;

        if ((field as any).service_id != null) {
            out.add(String((field as any).service_id));
        }
        for (const option of field.options ?? []) {
            if ((option as any).service_id != null) {
                out.add(String((option as any).service_id));
            }
        }
    }

    return out;
}

function policyProjectValue(
    cap: DgpServiceCapability | undefined,
    projection: string,
) {
    if (!cap) return undefined;
    const key = projection.startsWith("service.")
        ? projection.slice(8)
        : projection;
    return (cap as any)[key];
}

function matchesRuleFilter(
    cap: DgpServiceCapability | undefined,
    rule: DynamicRule,
    tagId: string,
): boolean {
    if (!cap) return false;
    const f = rule.filter;
    if (!f) return true;

    return !(f.tag_id && !toStrSet(f.tag_id).has(String(tagId)));
}

function toStrSet(v: string | string[] | number | number[]): Set<string> {
    const arr = Array.isArray(v) ? v : [v];
    const s = new Set<string>();
    for (const x of arr) s.add(String(x));
    return s;
}

function candidatePassesRateCoherence(
    builder: Builder,
    serviceMap: DgpServiceMap,
    tagId: string,
    selectedKeys: string[],
    usedServiceIds: readonly ServiceIdRef[],
    candidateId: ServiceIdRef,
    ratePolicy: RatePolicy,
): boolean {
    if (usedServiceIds.length === 0) return true;

    const props = builder.getProps();
    const baseFields = props.fields ?? [];
    const candidateFieldId = syntheticServiceFieldId("candidate", candidateId, 0);

    const syntheticFields: Field[] = [
        ...usedServiceIds.map((serviceId, index) => ({
            id: syntheticServiceFieldId("used", serviceId, index),
            label: `Used service ${String(serviceId)}`,
            type: "custom",
            button: true,
            service_id: serviceId,
            pricing_role: "base",
        }) satisfies Field),
        {
            id: candidateFieldId,
            label: `Candidate ${String(candidateId)}`,
            type: "custom",
            button: true,
            service_id: candidateId,
            pricing_role: "base",
        } satisfies Field,
    ];

    const fields = [...baseFields, ...syntheticFields];
    const visibleFieldIds = [
        ...builder.visibleFields(tagId, selectedKeys),
        ...syntheticFields.map((field) => field.id),
    ];

    const anchoredFilters = (props.filters ?? []).map((tag) =>
        tag.id === tagId && usedServiceIds[0] != null
            ? { ...tag, service_id: usedServiceIds[0] }
            : tag,
    );

    const validationProps = {
        ...props,
        filters: anchoredFilters,
        fields,
    };

    const errors: ValidationCtx["errors"] = [];
    const tags = validationProps.filters ?? [];
    const fieldById = new Map(fields.map((field) => [field.id, field]));
    const tagById = new Map(tags.map((tag) => [tag.id, tag]));

    const v: ValidationCtx = {
        props: validationProps,
        nodeMap: buildNodeMap(validationProps),
        options: {
            ...builder.getOptions?.(),
            serviceMap,
            ratePolicy,
        },
        errors,
        serviceMap,
        selectedKeys: new Set(selectedKeys),
        tags,
        fields,
        invalidRateFieldIds: new Set<string>(),
        tagById,
        fieldById,
        fieldsVisibleUnder: () => [],
        simulatedVisibilityContexts: [],
    };

    validateRateCoherenceForVisibleContext({
        v,
        tagId,
        selectedKeys,
        visibleFieldIds,
        effectMap: buildTriggerEffectMap(validationProps),
        seen: new Set<string>(),
    });

    return !errors.some((error) =>
        rateIssueAffectsCandidate(
            error,
            candidateId,
            candidateFieldId,
            usedServiceIds[0],
        ),
    );
}

function syntheticServiceFieldId(
    kind: "used" | "candidate",
    serviceId: ServiceIdRef,
    index: number,
): string {
    return `__service_filter_${kind}__:${index}:${String(serviceId)}`;
}

function rateIssueAffectsCandidate(
    error: ValidationCtx["errors"][number],
    candidateId: ServiceIdRef,
    candidateFieldId: string,
    primaryAnchorId?: ServiceIdRef,
): boolean {
    if (error.code !== "rate_coherence_violation") return false;

    const candidateKey = String(candidateId);
    const details = (error.details ?? {}) as {
        affectedServiceIds?: unknown[];
        primary?: {
            serviceId?: unknown;
            service_id?: unknown;
            fieldId?: unknown;
            nodeId?: unknown;
        };
        candidate?: {
            serviceId?: unknown;
            service_id?: unknown;
            fieldId?: unknown;
            nodeId?: unknown;
        };
    };
    const anchorKey =
        primaryAnchorId == null ? undefined : String(primaryAnchorId);
    const primaryMatchesAnchor =
        anchorKey == null ||
        String(details.primary?.serviceId) === anchorKey ||
        String(details.primary?.service_id) === anchorKey;

    if (
        primaryMatchesAnchor &&
        details.affectedServiceIds?.some(
            (serviceId) => String(serviceId) === candidateKey,
        )
    ) {
        return true;
    }

    if (primaryMatchesAnchor && String(error.nodeId) === candidateFieldId) {
        return true;
    }

    return [details.primary, details.candidate].some((ref) => {
        if (!ref) return false;
        if (!primaryMatchesAnchor) return false;

        return (
            String(ref.serviceId) === candidateKey ||
            String(ref.service_id) === candidateKey ||
            String(ref.fieldId) === candidateFieldId ||
            String(ref.nodeId) === candidateFieldId
        );
    });
}
