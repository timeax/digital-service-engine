import type { OptionEffectForButton, ServiceProps } from "@/schema";
import { fieldOptionIdSet } from "@/core/options";
import type { EditorModuleContext } from "./editor-types";
import { isActualButtonField } from "./editor-utils";

type EffectKind = "include" | "exclude";
type OptionEffectPatch = OptionEffectForButton | undefined | null;

function assertCanonicalId(id: string, label: string): void {
    if (!id || id.includes("::") || id.includes("/")) {
        throw new Error(
            `${label}: expected a raw field or option id, not a composite/path id`,
        );
    }
}

function assertTrigger(ctx: EditorModuleContext, triggerId: string): void {
    assertCanonicalId(triggerId, "option effect trigger");
    const trigger = ctx.getNode(triggerId);
    if (trigger.kind === "option" && trigger.data) return;
    if (
        trigger.kind === "field" &&
        trigger.data &&
        isActualButtonField(trigger.data)
    ) {
        return;
    }
    throw new Error(
        "option effect trigger must be an option id or button field id",
    );
}

function assertTargetField(
    props: ServiceProps,
    targetFieldId: string,
) {
    assertCanonicalId(targetFieldId, "option effect target");
    const field = (props.fields ?? []).find((item) => item.id === targetFieldId);
    if (!field) {
        throw new Error(`option effect target field not found: ${targetFieldId}`);
    }
    return field;
}

function dedupe(values: readonly string[] | undefined): string[] | undefined {
    if (!values) return undefined;
    const out: string[] = [];
    for (const value of values) {
        const id = String(value);
        if (!id || out.includes(id)) continue;
        out.push(id);
    }
    return out.length ? out : undefined;
}

function assertTargetOptions(
    props: ServiceProps,
    targetFieldId: string,
    ids: readonly string[] | undefined,
    kind: EffectKind,
): void {
    if (!ids?.length) return;
    const field = assertTargetField(props, targetFieldId);
    const valid = fieldOptionIdSet(field);
    for (const id of ids) {
        assertCanonicalId(String(id), `option effect ${kind} option`);
        if (!valid.has(String(id))) {
            throw new Error(
                `option effect ${kind} option not found under ${targetFieldId}: ${String(id)}`,
            );
        }
    }
}

function normalizeEffect(
    effect: OptionEffectPatch,
): OptionEffectForButton | undefined {
    if (!effect) return undefined;
    const exclude = dedupe(effect.exclude);
    const excluded = new Set(exclude ?? []);
    const include = dedupe(effect.include)?.filter((id) => !excluded.has(id));
    const out: OptionEffectForButton = {};
    if (effect.forceVisible === true) out.forceVisible = true;
    if (include?.length) out.include = include;
    if (exclude?.length) out.exclude = exclude;
    return Object.keys(out).length ? out : undefined;
}

function ensureTargetMap(
    props: ServiceProps,
    triggerId: string,
): Record<string, OptionEffectForButton> {
    props.option_effects_for_buttons ??= {};
    props.option_effects_for_buttons[triggerId] ??= {};
    return props.option_effects_for_buttons[triggerId]!;
}

function pruneEffectMap(props: ServiceProps, triggerId?: string): void {
    const map = props.option_effects_for_buttons;
    if (!map) return;
    const keys = triggerId ? [triggerId] : Object.keys(map);
    for (const key of keys) {
        const targets = map[key];
        if (!targets || Object.keys(targets).length === 0) delete map[key];
    }
    if (Object.keys(map).length === 0) delete props.option_effects_for_buttons;
}

function validateEffect(
    ctx: EditorModuleContext,
    props: ServiceProps,
    triggerId: string,
    targetFieldId: string,
    effect: OptionEffectPatch,
): OptionEffectForButton | undefined {
    assertTrigger(ctx, triggerId);
    assertTargetField(props, targetFieldId);
    assertTargetOptions(props, targetFieldId, effect?.include, "include");
    assertTargetOptions(props, targetFieldId, effect?.exclude, "exclude");
    return normalizeEffect(effect);
}

export function setOptionEffect(
    ctx: EditorModuleContext,
    triggerId: string,
    targetFieldId: string,
    effect: OptionEffectPatch,
): void {
    ctx.exec({
        name: "setOptionEffect",
        do: () =>
            ctx.patchProps((props) => {
                const normalized = validateEffect(
                    ctx,
                    props,
                    triggerId,
                    targetFieldId,
                    effect,
                );
                if (!normalized) {
                    const map = props.option_effects_for_buttons?.[triggerId];
                    if (map) delete map[targetFieldId];
                    pruneEffectMap(props, triggerId);
                    return;
                }
                ensureTargetMap(props, triggerId)[targetFieldId] = normalized;
            }),
        undo: () => ctx.undo(),
    });
}

export function patchOptionEffect(
    ctx: EditorModuleContext,
    triggerId: string,
    targetFieldId: string,
    patch: OptionEffectForButton,
): void {
    ctx.exec({
        name: "patchOptionEffect",
        do: () =>
            ctx.patchProps((props) => {
                const current =
                    props.option_effects_for_buttons?.[triggerId]?.[
                        targetFieldId
                    ] ?? {};
                const merged = {
                    ...current,
                    ...patch,
                };
                const normalized = validateEffect(
                    ctx,
                    props,
                    triggerId,
                    targetFieldId,
                    merged,
                );
                if (!normalized) {
                    const map = props.option_effects_for_buttons?.[triggerId];
                    if (map) delete map[targetFieldId];
                    pruneEffectMap(props, triggerId);
                    return;
                }
                ensureTargetMap(props, triggerId)[targetFieldId] = normalized;
            }),
        undo: () => ctx.undo(),
    });
}

export function clearOptionEffect(
    ctx: EditorModuleContext,
    triggerId: string,
    targetFieldId: string,
): void {
    ctx.exec({
        name: "clearOptionEffect",
        do: () =>
            ctx.patchProps((props) => {
                const map = props.option_effects_for_buttons?.[triggerId];
                if (!map) return;
                delete map[targetFieldId];
                pruneEffectMap(props, triggerId);
            }),
        undo: () => ctx.undo(),
    });
}

export function clearOptionEffectsForTrigger(
    ctx: EditorModuleContext,
    triggerId: string,
): void {
    ctx.exec({
        name: "clearOptionEffectsForTrigger",
        do: () =>
            ctx.patchProps((props) => {
                if (!props.option_effects_for_buttons) return;
                delete props.option_effects_for_buttons[triggerId];
                pruneEffectMap(props);
            }),
        undo: () => ctx.undo(),
    });
}

export function clearOptionEffectsForTarget(
    ctx: EditorModuleContext,
    targetFieldId: string,
): void {
    ctx.exec({
        name: "clearOptionEffectsForTarget",
        do: () =>
            ctx.patchProps((props) => {
                const map = props.option_effects_for_buttons;
                if (!map) return;
                for (const triggerId of Object.keys(map)) {
                    delete map[triggerId]?.[targetFieldId];
                }
                pruneEffectMap(props);
            }),
        undo: () => ctx.undo(),
    });
}

export function addOptionEffectOptions(
    ctx: EditorModuleContext,
    triggerId: string,
    targetFieldId: string,
    kind: EffectKind,
    optionIds: readonly string[],
): void {
    const additions = dedupe(optionIds) ?? [];
    if (!additions.length) return;
    ctx.exec({
        name: "addOptionEffectOptions",
        do: () =>
            ctx.patchProps((props) => {
                const current =
                    props.option_effects_for_buttons?.[triggerId]?.[
                        targetFieldId
                    ] ?? {};
                const nextValues = dedupe([
                    ...(current[kind] ?? []),
                    ...additions,
                ]);
                const normalized = validateEffect(
                    ctx,
                    props,
                    triggerId,
                    targetFieldId,
                    {
                        ...current,
                        [kind]: nextValues,
                    },
                );
                if (!normalized) return;
                ensureTargetMap(props, triggerId)[targetFieldId] = normalized;
            }),
        undo: () => ctx.undo(),
    });
}

export function removeOptionEffectOptions(
    ctx: EditorModuleContext,
    triggerId: string,
    targetFieldId: string,
    kind: EffectKind,
    optionIds: readonly string[],
): void {
    const removals = new Set(dedupe(optionIds) ?? []);
    if (!removals.size) return;
    ctx.exec({
        name: "removeOptionEffectOptions",
        do: () =>
            ctx.patchProps((props) => {
                const current =
                    props.option_effects_for_buttons?.[triggerId]?.[
                        targetFieldId
                    ];
                if (!current) return;
                const next = {
                    ...current,
                    [kind]: (current[kind] ?? []).filter(
                        (optionId) => !removals.has(optionId),
                    ),
                };
                const normalized = validateEffect(
                    ctx,
                    props,
                    triggerId,
                    targetFieldId,
                    next,
                );
                if (!normalized) {
                    delete props.option_effects_for_buttons?.[triggerId]?.[
                        targetFieldId
                    ];
                    pruneEffectMap(props, triggerId);
                    return;
                }
                ensureTargetMap(props, triggerId)[targetFieldId] = normalized;
            }),
        undo: () => ctx.undo(),
    });
}

export function setOptionEffectForceVisible(
    ctx: EditorModuleContext,
    triggerId: string,
    targetFieldId: string,
    forceVisible: boolean | undefined,
): void {
    patchOptionEffect(ctx, triggerId, targetFieldId, {
        forceVisible: forceVisible === true ? true : undefined,
    });
}
