import type {
    DgpServiceMap,
    Field,
    PricingRole,
    ServiceIdRef,
    ServiceProps,
    Tag,
} from "@/schema";
import type { RatePolicy } from "@/schema/validation";
import { Builder } from "./builder";
import {
    getServiceCapability,
    normalizeRatePolicy,
    passesRatePolicy,
} from "@/utils/util";
import { isMultiField } from "@/utils";

type BaseMember = {
    kind: "field" | "option";
    id: string;
    fieldId: string;
    label?: string;
    service_id: ServiceIdRef;
    rate: number;
};

type FieldReference = {
    refKind: "single" | "multi";
    nodeId: string;
    fieldId: string;
    label?: string;
    rate: number;
    service_id?: ServiceIdRef;
    members: BaseMember[];
};

type Anchor = {
    kind: "field" | "option";
    id: string;
    fieldId: string;
    label?: string;
};

type SimulationAnchor = {
    kind: "field" | "option";
    id: string;
    fieldId: string;
    label?: string;
};

type SharedDiagnostic = {
    scope: "visible_group";
    tagId: string;
    nodeId: string;
    message: string;
    simulationAnchor?: SimulationAnchor;
    invalidFieldIds: string[];
    affectedIds: string[];
    affectedServiceIds?: string[];
};

export type TriggerEffects = {
    includes: Set<string>;
    excludes: Set<string>;
};

export type TriggerEffectMap = Map<string, TriggerEffects>;

function uniqueStrings(values: Array<string | undefined>): string[] {
    const out = new Set<string>();
    for (const value of values) {
        if (!value) continue;
        out.add(value);
    }
    return Array.from(out);
}

export function buildTriggerEffectMap(props: ServiceProps): TriggerEffectMap {
    const map: TriggerEffectMap = new Map();

    const ensure = (key: string): TriggerEffects => {
        let item = map.get(key);
        if (!item) {
            item = { includes: new Set<string>(), excludes: new Set<string>() };
            map.set(key, item);
        }
        return item;
    };

    for (const [key, ids] of Object.entries(props.includes_for_buttons ?? {})) {
        const item = ensure(key);
        for (const id of ids ?? []) item.includes.add(id);
    }

    for (const [key, ids] of Object.entries(props.excludes_for_buttons ?? {})) {
        const item = ensure(key);
        for (const id of ids ?? []) item.excludes.add(id);
    }

    return map;
}

export function isRefExcludedBySelectedKeys(
    ref: { fieldId?: string; nodeId: string },
    selectedKeys: readonly string[],
    effectMap: TriggerEffectMap,
): boolean {
    for (const key of selectedKeys) {
        const effects = effectMap.get(key);
        if (!effects) continue;
        if (
            (ref.fieldId && effects.excludes.has(ref.fieldId)) ||
            effects.excludes.has(ref.nodeId)
        ) {
            return true;
        }
    }
    return false;
}

export type RateCoherenceDiagnostic =
    | (SharedDiagnostic & {
          kind: "contextual";
          primary: {
              nodeId: string;
              fieldId: string;
              label?: string;
              refKind: "single" | "multi";
              service_id?: ServiceIdRef;
              rate: number;
          };
          offender: {
              nodeId: string;
              fieldId: string;
              label?: string;
              refKind: "single" | "multi";
              service_id?: ServiceIdRef;
              rate: number;
          };
          policy: RatePolicy["kind"];
          policyPct?: number;
      })
    | (SharedDiagnostic & {
          kind: "internal_field";
          fieldId: string;
      });

export function validateRateCoherenceDeep(params: {
    builder: Builder;
    services: DgpServiceMap;
    tagId: string;
    ratePolicy?: RatePolicy;
    invalidFieldIds?: Iterable<string>;
}): RateCoherenceDiagnostic[] {
    const { builder, services, tagId } = params;
    const ratePolicy = normalizeRatePolicy(params.ratePolicy);
    const props = builder.getProps() as ServiceProps;
    const invalidFieldIds = new Set(params.invalidFieldIds ?? []);

    const fields = props.fields ?? [];
    const fieldById = new Map(fields.map((f) => [f.id, f]));
    const tagById = new Map((props.filters ?? []).map((t) => [t.id, t]));
    const tag = tagById.get(tagId);

    const baselineFieldIds = builder.visibleFields(tagId, []);
    const baselineFields = baselineFieldIds
        .map((fid) => fieldById.get(fid))
        .filter(Boolean) as Field[];

    const anchors = collectAnchors(baselineFields);
    const diagnostics: RateCoherenceDiagnostic[] = [];
    const seen = new Set<string>();

    for (const anchor of anchors) {
        const selectedKeys =
            anchor.kind === "option"
                ? [anchor.id]
                : [anchor.fieldId];

        const visibleFields = builder
            .visibleFields(tagId, selectedKeys)
            .map((fid) => fieldById.get(fid))
            .filter(Boolean) as Field[];

        const visibleInvalidFieldIds = visibleFields
            .map((field) => field.id)
            .filter((fieldId) => invalidFieldIds.has(fieldId));

        for (const fieldId of visibleInvalidFieldIds) {
            const key = `internal|${tagId}|${fieldId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            diagnostics.push({
                kind: "internal_field",
                scope: "visible_group",
                tagId,
                fieldId,
                nodeId: fieldId,
                message: `Field "${fieldId}" is internally invalid under rate policy "${ratePolicy.kind}".`,
                simulationAnchor: {
                    kind: anchor.kind,
                    id: anchor.id,
                    fieldId: anchor.fieldId,
                    label: anchor.label,
                },
                invalidFieldIds: [fieldId],
                affectedIds: uniqueStrings([
                    tagId,
                    anchor.id,
                    anchor.fieldId,
                    fieldId,
                ]),
            });
        }

        const references = visibleFields.flatMap((field) =>
            collectFieldReferences(field, services),
        );
        if (references.length <= 1) continue;

        const primary = references.reduce((best, current) => {
            if (current.rate !== best.rate) {
                return current.rate > best.rate ? current : best;
            }
            const bestKey = `${best.fieldId}|${best.nodeId}`;
            const currentKey = `${current.fieldId}|${current.nodeId}`;
            return currentKey < bestKey ? current : best;
        });

        for (const candidate of references) {
            if (candidate.nodeId === primary.nodeId) continue;
            if (candidate.fieldId === primary.fieldId) continue;
            if (passesRatePolicy(ratePolicy, primary.rate, candidate.rate)) {
                continue;
            }

            const key = contextualKey(tagId, primary, candidate, ratePolicy);
            if (seen.has(key)) continue;
            seen.add(key);

            diagnostics.push({
                kind: "contextual",
                scope: "visible_group",
                tagId,
                nodeId: candidate.nodeId,
                primary: toDiagnosticRef(primary),
                offender: toDiagnosticRef(candidate),
                policy: ratePolicy.kind,
                policyPct: "pct" in ratePolicy ? ratePolicy.pct : undefined,
                message: explainRateMismatch(
                    ratePolicy,
                    primary,
                    candidate,
                    describeLabel(tag),
                ),
                simulationAnchor: {
                    kind: anchor.kind,
                    id: anchor.id,
                    fieldId: anchor.fieldId,
                    label: anchor.label,
                },
                invalidFieldIds: visibleInvalidFieldIds,
                affectedIds: uniqueStrings([
                    tagId,
                    ...selectedKeys,
                    anchor.id,
                    anchor.fieldId,
                    primary.nodeId,
                    primary.fieldId,
                    candidate.nodeId,
                    candidate.fieldId,
                ]),
                affectedServiceIds: uniqueStrings([
                    primary.service_id == null ? undefined : String(primary.service_id),
                    candidate.service_id == null ? undefined : String(candidate.service_id),
                ]),
            });
        }
    }

    return diagnostics;
}

function collectAnchors(fields: Field[]): Anchor[] {
    const anchors: Anchor[] = [];

    for (const field of fields) {
        if (!isButton(field)) continue;

        if (Array.isArray(field.options) && field.options.length > 0) {
            for (const option of field.options) {
                anchors.push({
                    kind: "option",
                    id: option.id,
                    fieldId: field.id,
                    label: option.label ?? option.id,
                });
            }
            continue;
        }

        anchors.push({
            kind: "field",
            id: field.id,
            fieldId: field.id,
            label: field.label ?? field.id,
        });
    }

    return anchors;
}

function collectFieldReferences(
    field: Field,
    services: DgpServiceMap,
): FieldReference[] {
    const members = collectBaseMembers(field, services);
    if (members.length === 0) return [];

    if (isMultiField(field)) {
        const averageRate =
            members.reduce((sum, member) => sum + member.rate, 0) /
            members.length;
        return [
            {
                refKind: "multi",
                nodeId: field.id,
                fieldId: field.id,
                label: field.label ?? field.id,
                rate: averageRate,
                members,
            },
        ];
    }

    return members.map((member) => ({
        refKind: "single",
        nodeId: member.id,
        fieldId: field.id,
        label: member.label,
        rate: member.rate,
        service_id: member.service_id,
        members: [member],
    }));
}

function collectBaseMembers(
    field: Field,
    services: DgpServiceMap,
): BaseMember[] {
    const members: BaseMember[] = [];

    if (Array.isArray(field.options) && field.options.length > 0) {
        for (const option of field.options) {
            const role = normalizeRole(option.pricing_role ?? field.pricing_role, "base");
            if (role !== "base") continue;
            if (option.service_id === undefined || option.service_id === null) {
                continue;
            }
            const cap = getServiceCapability(services, option.service_id);
            if (!cap || typeof cap.rate !== "number" || !Number.isFinite(cap.rate)) {
                continue;
            }
            members.push({
                kind: "option",
                id: option.id,
                fieldId: field.id,
                label: option.label ?? option.id,
                service_id: option.service_id,
                rate: cap.rate,
            });
        }
        return members;
    }

    const role = normalizeRole(field.pricing_role, "base");
    if (role !== "base") return members;
    if (field.service_id === undefined || field.service_id === null) return members;

    const cap = getServiceCapability(services, field.service_id);
    if (!cap || typeof cap.rate !== "number" || !Number.isFinite(cap.rate)) {
        return members;
    }

    members.push({
        kind: "field",
        id: field.id,
        fieldId: field.id,
        label: field.label ?? field.id,
        service_id: field.service_id,
        rate: cap.rate,
    });
    return members;
}

function isButton(field: Field): boolean {
    if ((field as any).button === true) return true;
    return Array.isArray(field.options) && field.options.length > 0;
}

function normalizeRole(
    role: PricingRole | undefined,
    fallback: PricingRole,
): PricingRole {
    return role === "base" || role === "utility" ? role : fallback;
}

function toDiagnosticRef(reference: FieldReference) {
    return {
        nodeId: reference.nodeId,
        fieldId: reference.fieldId,
        label: reference.label,
        refKind: reference.refKind,
        service_id: reference.service_id,
        rate: reference.rate,
    };
}

function contextualKey(
    tagId: string,
    primary: FieldReference,
    candidate: FieldReference,
    ratePolicy: RatePolicy,
): string {
    const pctKey = "pct" in ratePolicy ? `:${ratePolicy.pct}` : "";
    return [
        "contextual",
        tagId,
        primary.fieldId,
        primary.nodeId,
        candidate.fieldId,
        candidate.nodeId,
        `${ratePolicy.kind}${pctKey}`,
    ].join("|");
}

function describeLabel(tag?: Tag): string {
    return tag?.label ?? tag?.id ?? "tag";
}

function explainRateMismatch(
    policy: RatePolicy,
    primary: FieldReference,
    candidate: FieldReference,
    where: string,
): string {
    const primaryLabel = `${primary.label ?? primary.nodeId} (${primary.rate})`;
    const candidateLabel = `${candidate.label ?? candidate.nodeId} (${candidate.rate})`;

    switch (policy.kind) {
        case "eq_primary":
            return `Rate coherence failed (${where}): ${candidateLabel} must exactly match ${primaryLabel}.`;
        case "lte_primary":
            return `Rate coherence failed (${where}): ${candidateLabel} must stay within ${policy.pct}% below and never above ${primaryLabel}.`;
        case "within_pct":
            return `Rate coherence failed (${where}): ${candidateLabel} must be within ${policy.pct}% of ${primaryLabel}.`;
        case "at_least_pct_lower":
            return `Rate coherence failed (${where}): ${candidateLabel} must be at least ${policy.pct}% lower than ${primaryLabel}.`;
    }
}
