import type { Builder } from "@/core/builder";
import { compilePolicies, type PolicyDiagnostic } from "@/core/policy";
import type {
    DgpServiceCapability,
    DgpServiceMap,
    DynamicRule,
    FallbackSettings,
    ServiceIdRef,
} from "@/schema";
import {
    constraintFitOk,
    getServiceCapability,
    rateOk,
    toFiniteNumber,
} from "@/utils/util";

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
        fallback?: FallbackSettings;
        strictSafety?: boolean;
        enforcePolicies?: boolean;
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
    const { context } = input;

    const usedSet = new Set(context.usedServiceIds.map(String));
    const primary = context.usedServiceIds[0];

    const fb: FallbackSettings = {
        requireConstraintFit: true,
        ratePolicy: { kind: "lte_primary", pct: 5 },
        selectionStrategy: "priority",
        mode: "strict",
        ...(context.fallback ?? {}),
    };

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
            primary == null ? true : rateOk(svcMap, id, primary, fb);

        const polRes = evaluatePoliciesRaw(
            context.policies ?? [],
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
            policyWarnings: polRes.warnings.length ? polRes.warnings : undefined,
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

    const visibleFieldIds = new Set(builder.visibleFields(tagId, selectedButtons));
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
    const key = projection.startsWith("service.") ? projection.slice(8) : projection;
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

    if (f.tag_id && !toStrSet(f.tag_id).has(String(tagId))) return false;
    return true;
}

function toStrSet(v: string | string[] | number | number[]): Set<string> {
    const arr = Array.isArray(v) ? v : [v];
    const s = new Set<string>();
    for (const x of arr) s.add(String(x));
    return s;
}
