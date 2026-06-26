// src/core/validate/steps/option-maps.ts
import type { ValidationCtx } from "../shared";
import { withAffected } from "../shared";
import { fieldOptionIdSet } from "@/core/options";

export function validateOptionMaps(v: ValidationCtx): void {
    const incMap: Record<string, string[]> = v.props.includes_for_buttons ?? {};
    const excMap: Record<string, string[]> = v.props.excludes_for_buttons ?? {};

    const badKeyMessage = (key: string): string =>
        `Invalid trigger-map key "${key}". Expected a known option id or button-field id.`;

    /**
     * Valid trigger keys:
     * - nodeMap has key:
     *    - kind:"option" => ok
     *    - kind:"field"  => ok only if field.button === true
     *    - kind:"tag"    => invalid
     */
    const validateTriggerKey = (
        key: string,
    ): {
        ok: boolean;
        nodeId?: string; // for error anchoring
        affected?: string[]; // for withAffected
    } => {
        const ref = v.nodeMap.get(key);

        if (ref) {
            if (ref.kind === "option") {
                // option trigger id is ref.id (key), and we know its parent field
                return {
                    ok: true,
                    nodeId: ref.fieldId,
                    affected: [ref.fieldId, ref.id],
                };
            }

            if (ref.kind === "field") {
                const isButton = (ref.node as any).button === true;
                if (!isButton)
                    return { ok: false, nodeId: ref.id, affected: [ref.id] };
                return { ok: true, nodeId: ref.id, affected: [ref.id] };
            }

            // tags cannot be triggers
            return { ok: false, nodeId: ref.id, affected: [ref.id] };
        }

        return { ok: false };
    };

    // bad_option_key (keeping the code name for compatibility)
    for (const k of Object.keys(incMap)) {
        const r = validateTriggerKey(k);
        if (!r.ok) {
            v.errors.push({
                code: "bad_option_key",
                severity: "error",
                message: badKeyMessage(k),
                nodeId: r.nodeId,
                details: withAffected({ key: k }, r.affected),
            });
        }
    }

    for (const k of Object.keys(excMap)) {
        const r = validateTriggerKey(k);
        if (!r.ok) {
            v.errors.push({
                code: "bad_option_key",
                severity: "error",
                message: badKeyMessage(k),
                nodeId: r.nodeId,
                details: withAffected({ key: k }, r.affected),
            });
        }
    }

    const effectMap = v.props.option_effects_for_buttons ?? {};
    for (const [triggerKey, targets] of Object.entries(effectMap)) {
        const trigger = validateTriggerKey(triggerKey);
        if (!trigger.ok) {
            v.errors.push({
                code: "bad_option_effect_key",
                severity: "error",
                message: badKeyMessage(triggerKey),
                nodeId: trigger.nodeId,
                details: withAffected({ key: triggerKey }, trigger.affected),
            });
        }

        for (const [targetFieldId, effect] of Object.entries(targets ?? {})) {
            const field = v.fieldById.get(targetFieldId);
            if (!field) {
                v.errors.push({
                    code: "bad_option_effect_target",
                    severity: "error",
                    message: `Option effect trigger "${triggerKey}" targets unknown field "${targetFieldId}".`,
                    details: withAffected(
                        { key: triggerKey, targetFieldId },
                        trigger.affected,
                    ),
                });
                continue;
            }

            const validOptionIds = fieldOptionIdSet(field);
            const checkTargetOptions = (
                kind: "include" | "exclude",
                optionIds: string[] | undefined,
            ) => {
                for (const optionId of optionIds ?? []) {
                    if (validOptionIds.has(optionId)) continue;
                    v.errors.push({
                        code: "bad_option_effect_option",
                        severity: "error",
                        message: `Option effect trigger "${triggerKey}" references unknown ${kind} option "${optionId}" for field "${targetFieldId}".`,
                        nodeId: targetFieldId,
                        details: withAffected(
                            {
                                key: triggerKey,
                                targetFieldId,
                                optionId,
                                kind,
                            },
                            [targetFieldId, optionId],
                        ),
                    });
                }
            };

            checkTargetOptions("include", effect?.include);
            checkTargetOptions("exclude", effect?.exclude);
        }
    }

    // option_include_exclude_conflict: SAME RAW KEY in both maps
    for (const k of Object.keys(incMap)) {
        if (!(k in excMap)) continue;

        const r = validateTriggerKey(k);
        v.errors.push({
            code: "option_include_exclude_conflict",
            severity: "error",
            message: `Trigger-map key "${k}" appears in both includes_for_buttons and excludes_for_buttons.`,
            nodeId: r.nodeId,
            details: withAffected({ key: k }, r.affected),
        });
    }
}
