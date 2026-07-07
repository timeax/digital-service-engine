import { fieldOptionIdSet } from "@/core/options";
import { resolveVisibility } from "@/core/visibility";
import type { Field } from "@/schema";
import type { ValidationCtx } from "../shared";
import { withAffected } from "../shared";

type TriggerInfo = {
    id: string;
    kind: "tag" | "field" | "option";
    ownerFieldId?: string;
    tagContextId?: string;
};

export function validateValueEffects(v: ValidationCtx): void {
    const effectMap = v.props.value_effects_for_triggers ?? {};
    if (!Object.keys(effectMap).length) return;

    const triggerById = buildTriggerIndex(v);
    const valueEdges = new Map<string, Set<string>>();

    for (const [triggerId, targets] of Object.entries(effectMap)) {
        const trigger = triggerById.get(triggerId);
        if (!trigger) {
            v.errors.push({
                code: "value_effect_trigger_missing",
                severity: "error",
                message: `Value effect trigger "${triggerId}" is not a known tag, button field, or option.`,
                details: { triggerId },
            });
        }

        for (const [targetFieldId, effect] of Object.entries(targets ?? {})) {
            const field = v.fieldById.get(targetFieldId);
            if (!field) {
                v.errors.push({
                    code: "value_effect_target_missing",
                    severity: "error",
                    message: `Value effect trigger "${triggerId}" targets unknown field "${targetFieldId}".`,
                    details: withAffected(
                        { triggerId, targetFieldId },
                        trigger ? [triggerId] : undefined,
                    ),
                });
                continue;
            }

            const values = Array.isArray(effect?.value)
                ? effect.value
                : [effect?.value];

            if (values.length > 1 && field.meta?.multi !== true) {
                v.errors.push({
                    code: "value_effect_multiple_values_for_single_field",
                    severity: "error",
                    message: `Value effect trigger "${triggerId}" assigns multiple values to non-multi field "${targetFieldId}".`,
                    nodeId: targetFieldId,
                    details: withAffected(
                        { triggerId, targetFieldId, values },
                        [triggerId, targetFieldId],
                    ),
                });
            }

            const optionIds = fieldOptionIdSet(field);
            if (optionIds.size) {
                for (const value of values) {
                    if (optionIds.has(String(value))) continue;
                    v.errors.push({
                        code: "value_effect_invalid_option",
                        severity: "error",
                        message: `Value effect trigger "${triggerId}" assigns option "${String(value)}" that does not belong to field "${targetFieldId}".`,
                        nodeId: targetFieldId,
                        details: withAffected(
                            {
                                triggerId,
                                targetFieldId,
                                optionId: String(value),
                            },
                            [triggerId, targetFieldId, String(value)],
                        ),
                    });
                }
            }

            if (trigger && !canTargetBeVisible(v, trigger, targetFieldId)) {
                v.errors.push({
                    code: "value_effect_target_never_visible",
                    severity: "error",
                    message: `Value effect trigger "${triggerId}" targets field "${targetFieldId}", but that field is not visible in the trigger context.`,
                    nodeId: targetFieldId,
                    details: withAffected(
                        {
                            triggerId,
                            targetFieldId,
                            tagContextId: trigger.tagContextId,
                        },
                        [triggerId, targetFieldId],
                    ),
                });
            }

            for (const value of values) {
                const nextTrigger = triggerById.get(String(value));
                if (!nextTrigger || nextTrigger.kind === "tag") continue;
                if (!optionIds.has(String(value))) continue;
                addEdge(valueEdges, triggerId, String(value));
            }
        }
    }

    reportCycles(v, valueEdges);
}

function buildTriggerIndex(v: ValidationCtx): Map<string, TriggerInfo> {
    const out = new Map<string, TriggerInfo>();

    for (const tag of v.tags) {
        out.set(tag.id, {
            id: tag.id,
            kind: "tag",
            tagContextId: tag.id,
        });
    }

    for (const field of v.fields) {
        if (field.button === true) {
            out.set(field.id, {
                id: field.id,
                kind: "field",
                ownerFieldId: field.id,
                tagContextId: firstBindId(field),
            });
        }
    }

    for (const field of v.fields) {
        for (const optionId of fieldOptionIdSet(field)) {
            out.set(optionId, {
                id: optionId,
                kind: "option",
                ownerFieldId: field.id,
                tagContextId: firstBindId(field),
            });
        }
    }

    return out;
}

function firstBindId(field: Field): string | undefined {
    if (Array.isArray(field.bind_id)) return field.bind_id[0];
    return field.bind_id;
}

function canTargetBeVisible(
    v: ValidationCtx,
    trigger: TriggerInfo,
    targetFieldId: string,
): boolean {
    const tagContextId = trigger.tagContextId;
    if (!tagContextId || !v.tagById.has(tagContextId)) return true;

    const selected = trigger.kind === "tag" ? [] : [trigger.id];
    const visible = new Set(
        resolveVisibility(v.props, tagContextId, selected).fieldIds,
    );

    return visible.has(targetFieldId);
}

function addEdge(
    map: Map<string, Set<string>>,
    from: string,
    to: string,
): void {
    const set = map.get(from) ?? new Set<string>();
    set.add(to);
    map.set(from, set);
}

function reportCycles(v: ValidationCtx, edges: Map<string, Set<string>>): void {
    const reported = new Set<string>();

    const visit = (root: string, current: string, path: string[]) => {
        for (const next of edges.get(current) ?? []) {
            if (next === root) {
                const cycle = [...path, next];
                const key = cycle.join(">");
                if (reported.has(key)) continue;
                reported.add(key);
                v.errors.push({
                    code: "value_effect_cycle",
                    severity: "error",
                    message: `Value effect cycle detected: ${cycle.join(" -> ")}.`,
                    nodeId: current,
                    details: withAffected({ path: cycle }, cycle),
                });
                continue;
            }

            if (path.includes(next)) continue;
            visit(root, next, [...path, next]);
        }
    };

    for (const root of Array.from(edges.keys()).sort()) {
        visit(root, root, [root]);
    }
}
