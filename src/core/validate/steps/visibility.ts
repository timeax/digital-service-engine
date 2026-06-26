// src/core/validate/steps/visibility.ts

import type { Field, Tag } from "@/schema";
import type { SimulatedVisibilityContext, ValidationCtx } from "../shared";
import { isServiceIdRef, withAffected } from "../shared";
import { visibleFieldsUnder } from "@/core/visibility";
import { walkFieldOptions } from "@/core/options";

/**
 * v.selectedKeys is a Set<string> (per your note).
 * We keep the validator's "fieldsVisibleUnder" hook, but route all visibility
 * through the core visibility engine (single source of truth).
 */
export function createFieldsVisibleUnder(
    v: ValidationCtx,
): (tagId: string) => Field[] {
    return (tagId: string): Field[] => {
        return visibleFieldsUnder(v.props, tagId, {
            selectedKeys: v.selectedKeys,
        });
    };
}

/* -------------------------------------------------------------------------- */
/* Simulation-enabled validateVisibility                                      */
/* -------------------------------------------------------------------------- */

export type SimulateVisibilityOptions = {
    /**
     * When true, performs an in-depth selection simulation starting from root tag(s),
     * exploring states by selecting one selectable trigger at a time and re-validating.
     */
    simulate?: boolean;

    /**
     * Safety valve: max number of unique selection states validated.
     * Default: 500
     */
    maxStates?: number;

    /**
     * Safety valve: max depth of added selections from the base context.
     * Default: 6
     */
    maxDepth?: number;

    /**
     * If true, simulate starting from each root tag (tags without bind_id).
     * Otherwise, simulate only the first inferred root.
     */
    simulateAllRoots?: boolean;

    /**
     * If true, only simulate triggers that exist in includes_for_buttons/excludes_for_buttons
     * (massive branching reduction). Default: true.
     *
     * NOTE: Only enable this if selecting triggers has no other side effects besides
     * includes/excludes visibility effects.
     */
    onlyEffectfulTriggers?: boolean;
};

function stableKeyOfSelection(keys: Set<string>): string {
    return Array.from(keys).sort().join("|");
}

function resolveRootTags(tags: Tag[]): Tag[] {
    const roots = tags.filter((t) => !(t as any).bind_id);
    return roots.length ? roots : tags.slice(0, 1);
}

function collectSelectableTriggersInContext(
    v: ValidationCtx,
    tagId: string,
    selectedKeys: Set<string>,
    effectfulKeys: Set<string>,
): string[] {
    const visible = visibleFieldsUnder(v.props, tagId, {
        selectedKeys: selectedKeys,
    });

    const triggers: string[] = [];

    for (const f of visible) {
        // button-field trigger
        if ((f as any).button === true) {
            const t = f.id;
            if (effectfulKeys.has(t)) triggers.push(t);
        }

        // option triggers
        for (const { option: o } of walkFieldOptions(f)) {
            const t = o.id;
            if (effectfulKeys.has(t)) triggers.push(t);
        }
    }

    // deterministic expansion order
    triggers.sort();
    return triggers;
}

/**
 * The actual visibility rules (your previous validateVisibility body),
 * extracted so we can run it once per simulated selection state.
 */
function runVisibilityRulesOnce(v: ValidationCtx): void {
    // duplicate visible labels (selection-aware)
    for (const t of v.tags) {
        const visible: Field[] = v.fieldsVisibleUnder(t.id);
        const seen: Map<string, string> = new Map<string, string>();

        for (const f of visible) {
            const label: string = (f.label ?? "").trim();
            if (!label) continue;

            if (seen.has(label)) {
                const otherId: string | undefined = seen.get(label);

                v.errors.push({
                    code: "duplicate_visible_label",
                    severity: "error",
                    message: `Duplicate visible label "${label}" under tag "${t.id}".`,
                    nodeId: f.id,
                    details: withAffected(
                        { tagId: t.id, other: otherId, label },
                        otherId ? [t.id, f.id, otherId] : [t.id, f.id],
                    ),
                });
            } else {
                seen.set(label, f.id);
            }
        }
    }

    // Quantity marker rule: at most one marker per visible group (tag) (selection-aware)
    for (const t of v.tags) {
        const visible: Field[] = v.fieldsVisibleUnder(t.id);
        const markers: string[] = [];

        for (const f of visible) {
            const q: unknown = (f.meta as any)?.quantity;
            if (q) markers.push(f.id);
        }

        if (markers.length > 1) {
            v.errors.push({
                code: "quantity_multiple_markers",
                severity: "error",
                message: `Multiple quantity markers found under tag "${t.id}". Only one is allowed per visible group.`,
                nodeId: t.id,
                details: withAffected({ tagId: t.id, markers }, [
                    t.id,
                    ...markers,
                ]),
            });
        }
    }

    // utility_without_base per visible tag group (selection-aware)
    for (const t of v.tags) {
        const visible: Field[] = v.fieldsVisibleUnder(t.id);

        let hasBase: boolean = false;
        let hasUtility: boolean = false;
        const utilityOptionIds: string[] = [];

        for (const f of visible) {
            for (const { option: o } of walkFieldOptions(f)) {
                if (!isServiceIdRef(o.service_id)) continue;

                const role: string =
                    o.pricing_role ?? (f as any).pricing_role ?? "base";

                if (role === "base") hasBase = true;
                else if (role === "utility") {
                    hasUtility = true;
                    utilityOptionIds.push(o.id);
                }
            }
        }

        if (hasUtility && !hasBase) {
            v.errors.push({
                code: "utility_without_base",
                severity: "error",
                message: `Utility-priced options exist under tag "${t.id}" but no base-priced options were found in the same visible group.`,
                nodeId: t.id,
                details: withAffected({ tagId: t.id, utilityOptionIds }, [
                    t.id,
                    ...utilityOptionIds,
                ]),
            });
        }
    }
}

/**
 * De-dup only the errors added during simulation, so output stays stable.
 */
function dedupeErrorsInPlace(v: ValidationCtx, startIndex: number): void {
    const seen = new Set<string>();

    const keyOfErr = (e: any) => {
        const tagId = e?.details?.tagId ?? e?.details?.affected?.tagId ?? "";
        const other = e?.details?.other ?? "";
        return `${e?.code ?? ""}::${e?.nodeId ?? ""}::${tagId}::${other}::${e?.message ?? ""}`;
    };

    const kept: any[] = [];
    for (let i = startIndex; i < v.errors.length; i++) {
        const e = v.errors[i];
        const k = keyOfErr(e);
        if (seen.has(k)) continue;
        seen.add(k);
        kept.push(e);
    }

    v.errors.splice(startIndex, v.errors.length - startIndex, ...kept);
}

/**
 * validateVisibility(v, { simulate: true }) will:
 * - Start from the root tag context
 * - Compute visible fields under that root given current selection
 * - Enumerate selectable triggers (button fields + option triggers)
 * - DFS: add one trigger, re-validate, then from that new context add any
 *   newly-visible triggers, repeat… until depth/cap limits.
 */
export function validateVisibility(
    v: ValidationCtx,
    options: SimulateVisibilityOptions = {},
): void {
    v.simulatedVisibilityContexts = [];

    const simulate = options.simulate === true;

    if (!simulate) {
        runVisibilityRulesOnce(v);

        for (const tag of v.tags) {
            v.simulatedVisibilityContexts.push({
                tagId: tag.id,
                selectedKeys: Array.from(v.selectedKeys),
                visibleFieldIds: v.fieldsVisibleUnder(tag.id).map((f) => f.id),
            });
        }

        return;
    }

    const maxStates = Math.max(1, options.maxStates ?? 500);
    const maxDepth = Math.max(0, options.maxDepth ?? 6);
    const onlyEffectful = options.onlyEffectfulTriggers !== false; // default true
    const effectfulKeys = new Set<string>();
    if (onlyEffectful) {
        for (const key of Object.keys(v.props.includes_for_buttons ?? {})) {
            effectfulKeys.add(key);
        }
        for (const key of Object.keys(v.props.excludes_for_buttons ?? {})) {
            effectfulKeys.add(key);
        }
        for (const key of Object.keys(v.props.option_effects_for_buttons ?? {})) {
            effectfulKeys.add(key);
        }
    }

    const roots = resolveRootTags(v.tags);
    const rootTags = options.simulateAllRoots ? roots : roots.slice(0, 1);

    // snapshot original selection Set
    const originalSelected = new Set(v.selectedKeys ?? []);

    // we only dedupe what simulation adds
    const errorsStart = v.errors.length;

    // visited pruning by selection signature
    const visited = new Set<string>();
    const seenContexts = new Set<string>();

    type State = { rootTagId: string; selected: Set<string>; depth: number };
    const stack: State[] = [];

    // seed states (one per simulated root)
    for (const rt of rootTags) {
        stack.push({
            rootTagId: rt.id,
            selected: new Set(originalSelected),
            depth: 0,
        });
    }

    let validatedStates = 0;

    while (stack.length) {
        if (validatedStates >= maxStates) break;

        const state = stack.pop()!;
        const sig = `${state.rootTagId}::${stableKeyOfSelection(state.selected)}`;
        if (visited.has(sig)) continue;
        visited.add(sig);

        // apply selection for this state
        v.selectedKeys = state.selected;
        const visibleNow = visibleFieldsUnder(v.props, state.rootTagId, {
            selectedKeys: state.selected,
        }).map((f) => f.id);
        const context: SimulatedVisibilityContext = {
            tagId: state.rootTagId,
            selectedKeys: Array.from(state.selected),
            visibleFieldIds: visibleNow,
        };
        const contextKey = [
            context.tagId,
            [...context.selectedKeys].sort().join("|"),
            [...context.visibleFieldIds].sort().join("|"),
        ].join("::");
        if (!seenContexts.has(contextKey)) {
            seenContexts.add(contextKey);
            v.simulatedVisibilityContexts.push(context);
        }

        // validate once under this selection context
        validatedStates++;
        runVisibilityRulesOnce(v);

        // stop expanding deeper
        if (state.depth >= maxDepth) continue;

        // expand next possible triggers based on current visible context
        const triggers = collectSelectableTriggersInContext(
            v,
            state.rootTagId,
            state.selected,
            effectfulKeys,
        );

        // DFS, deterministic: push reverse so earlier triggers explored first
        for (let i = triggers.length - 1; i >= 0; i--) {
            const trig = triggers[i]!;
            if (state.selected.has(trig)) continue;

            const next = new Set(state.selected);
            next.add(trig);

            stack.push({
                rootTagId: state.rootTagId,
                selected: next,
                depth: state.depth + 1,
            });
        }
    }

    // restore original selection
    v.selectedKeys = originalSelected;

    // dedupe errors from simulation tail
    dedupeErrorsInPlace(v, errorsStart);

    // If you want a diagnostic warning when capped, you can add it here.
    // Example (non-breaking): add a "warning" severity error.
    // if (validatedStates >= maxStates) { ... }
}
