// src/core/validate/steps/option-maps.ts
import type { ValidationCtx } from "../shared";
import { withAffected } from "../shared";

type ParsedFallback = { fieldId: string; optionId: string };

/** Fallback parser for legacy "fieldId::optionId" keys */
function parseFieldOptionKey(key: string): ParsedFallback | null {
    const idx = key.indexOf("::");
    if (idx === -1) return null;

    const fieldId = key.slice(0, idx).trim();
    const optionId = key.slice(idx + 2).trim();

    if (!fieldId || !optionId) return null;
    return { fieldId, optionId };
}

function hasOption(v: ValidationCtx, fid: string, oid: string): boolean {
    const f = v.fieldById.get(fid);
    if (!f) return false;
    return !!(f.options ?? []).find((o) => o.id === oid);
}

export function validateOptionMaps(v: ValidationCtx): void {
    const incMap: Record<string, string[]> = v.props.includes_for_buttons ?? {};
    const excMap: Record<string, string[]> = v.props.excludes_for_buttons ?? {};

    const badKeyMessage = (key: string): string =>
        `Invalid trigger-map key "${key}". Expected a known node id (option or button-field), or "fieldId::optionId" pointing to an existing option.`;

    /**
     * Valid trigger keys:
     * - nodeMap has key:
     *    - kind:"option" => ok
     *    - kind:"field"  => ok only if field.button === true
     *    - kind:"tag"    => invalid
     * - else fallback: "fieldId::optionId" must point to an existing option under that field
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

        // fallback: fieldId::optionId
        const p = parseFieldOptionKey(key);
        if (!p) return { ok: false };

        if (!hasOption(v, p.fieldId, p.optionId))
            return {
                ok: false,
                nodeId: p.fieldId,
                affected: [p.fieldId, p.optionId],
            };

        return {
            ok: true,
            nodeId: p.fieldId,
            affected: [p.fieldId, p.optionId],
        };
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
