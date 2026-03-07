// src/core/fallback-editor.ts

import { collectFailedFallbacks, getEligibleFallbacks, getFallbackRegistrationInfo } from "@/core";

import type {
    FallbackCandidateCheck,
    FallbackCheckReason,
    FallbackCheckResult,
    FallbackEditorOptions,
    FallbackEditorState,
    FallbackMutationOptions,
    FallbackRegistration,
    FallbackScopeRef,
    Field,
    FieldOption,
    ServiceFallback,
    ServiceIdRef,
    ServiceProps,
    Tag
} from "@/schema";

/**
 * Keep the editor contract exactly as discussed:
 * - mutates only ServiceFallback (internal clone)
 * - props are read-only context
 * - get(serviceId) is service-centric
 * - getScope(context) is raw scope access
 */
export interface FallbackEditor {
    state(): FallbackEditorState;
    value(): ServiceFallback;
    reset(): FallbackEditorState;

    /** Service-centric: all registrations that belong to this primary service */
    get(serviceId: ServiceIdRef): FallbackRegistration[];

    /** Exact/raw scope access */
    getScope(context: FallbackScopeRef): ServiceIdRef[];

    /** Validation preview */
    check(
        context: FallbackScopeRef,
        candidates?: ServiceIdRef[],
    ): FallbackCheckResult;

    add(
        context: FallbackScopeRef,
        candidate: ServiceIdRef,
        options?: FallbackMutationOptions,
    ): FallbackEditorState;

    addMany(
        context: FallbackScopeRef,
        candidates: ServiceIdRef[],
        options?: FallbackMutationOptions,
    ): FallbackEditorState;

    remove(
        context: FallbackScopeRef,
        candidate: ServiceIdRef,
    ): FallbackEditorState;

    replace(
        context: FallbackScopeRef,
        candidates: ServiceIdRef[],
        options?: FallbackMutationOptions,
    ): FallbackEditorState;

    clear(context: FallbackScopeRef): FallbackEditorState;

    /**
     * Optional helper for picker UIs:
     * shows candidates that the core fallback resolver would currently accept.
     */
    eligible(
        context: FallbackScopeRef,
        options?: {
            exclude?: ServiceIdRef[];
            unique?: boolean;
            limit?: number;
        },
    ): ServiceIdRef[];
}

type NodeRegistrationInfo =
    | {
          ok: true;
          primary: ServiceIdRef;
          tagContexts: string[];
      }
    | {
          ok: false;
          reasons: FallbackCheckReason[];
      };

export function createFallbackEditor(
    options: FallbackEditorOptions = {},
): FallbackEditor {
    const original = cloneFallbacks(options.fallbacks);
    let current = cloneFallbacks(options.fallbacks);

    const props = options.props;
    const services = options.services ?? {};
    const settings = options.settings ?? {};

    function state(): FallbackEditorState {
        return {
            original: cloneFallbacks(original),
            current: cloneFallbacks(current),
            changed: !sameFallbacks(original, current),
        };
    }

    function value(): ServiceFallback {
        return cloneFallbacks(current);
    }

    function reset(): FallbackEditorState {
        current = cloneFallbacks(original);
        return state();
    }

    function get(serviceId: ServiceIdRef): FallbackRegistration[] {
        const out: FallbackRegistration[] = [];

        for (const [primary, list] of Object.entries(current.global ?? {})) {
            if (String(primary) !== String(serviceId)) continue;
            out.push({
                scope: "global",
                primary,
                services: [...(list ?? [])],
            });
        }

        if (!props) return out;

        for (const [nodeId, list] of Object.entries(current.nodes ?? {})) {
            const info = getFallbackRegistrationInfo(props, nodeId);
            if (String(info.primary) !== String(serviceId)) continue;

            out.push({
                scope: "node",
                scopeId: nodeId,
                primary: info.primary!,
                services: [...(list ?? [])],
            });
        }

        return out;
    }
    function getScope(context: FallbackScopeRef): ServiceIdRef[] {
        if (context.scope === "global") {
            return [...(current.global?.[context.primary] ?? [])];
        }
        return [...(current.nodes?.[context.nodeId] ?? [])];
    }

    function check(
        context: FallbackScopeRef,
        candidates?: ServiceIdRef[],
    ): FallbackCheckResult {
        const normalized = normalizeCandidateList(
            candidates ?? getScope(context),
            true,
        );

        if (context.scope === "node" && !props) {
            return {
                context,
                allowed: [],
                rejected: normalized.map((candidate) => ({
                    candidate,
                    ok: false,
                    reasons: ["missing_service_props"],
                })),
                warnings: ["missing_service_props"],
            };
        }

        // Build a temporary fallback payload with only this scope updated,
        // then let the canonical fallback validator tell us what fails.
        const tempFallbacks = cloneFallbacks(current);

        if (context.scope === "global") {
            tempFallbacks.global ??= {};
            if (normalized.length)
                tempFallbacks.global[context.primary] = normalized;
            else delete tempFallbacks.global[context.primary];
        } else {
            tempFallbacks.nodes ??= {};
            if (normalized.length)
                tempFallbacks.nodes[context.nodeId] = normalized;
            else delete tempFallbacks.nodes[context.nodeId];
        }

        // Without props, global checking can still do minimal structural validation.
        if (!props) {
            if (context.scope !== "global") {
                return {
                    context,
                    allowed: [],
                    rejected: normalized.map((candidate) => ({
                        candidate,
                        ok: false,
                        reasons: ["missing_service_props"],
                    })),
                    warnings: ["missing_service_props"],
                };
            }

            const rejected: FallbackCandidateCheck[] = [];
            const allowed: ServiceIdRef[] = [];

            for (const candidate of normalized) {
                const reasons: FallbackCheckReason[] = [];

                if (String(candidate) === String(context.primary)) {
                    reasons.push("self_reference");
                }

                if (reasons.length) {
                    rejected.push({ candidate, ok: false, reasons });
                } else {
                    allowed.push(candidate);
                }
            }

            return {
                context,
                primary: context.primary,
                allowed,
                rejected,
                warnings: [],
            };
        }

        const fakeProps: ServiceProps = {
            ...props,
            fallbacks: tempFallbacks,
        };

        const diags = collectFailedFallbacks(fakeProps, services, {
            ...settings,
            mode: "dev",
        });

        const scoped = diags.filter((d) => {
            if (context.scope === "global") {
                return (
                    d.scope === "global" &&
                    String(d.primary) === String(context.primary)
                );
            }
            return (
                d.scope === "node" &&
                String(d.nodeId) === String(context.nodeId)
            );
        });

        const rejected: FallbackCandidateCheck[] = normalized
            .map((candidate) => {
                const reasons = scoped
                    .filter((d) => String(d.candidate) === String(candidate))
                    .map((d) => mapDiagReason(d.reason));

                return {
                    candidate,
                    ok: reasons.length === 0,
                    reasons,
                };
            })
            .filter((row) => !row.ok);

        const allowed = normalized.filter(
            (candidate) =>
                !rejected.some(
                    (r) => String(r.candidate) === String(candidate),
                ),
        );

        const info =
            context.scope === "global"
                ? { ok: true, primary: context.primary }
                : getNodeRegistrationInfo(props, context.nodeId);
        const primary = info?.ok ? info.primary : undefined;

        return {
            context,
            primary,
            allowed,
            rejected,
            warnings: [],
        };
    }

    function add(
        context: FallbackScopeRef,
        candidate: ServiceIdRef,
        options?: FallbackMutationOptions,
    ): FallbackEditorState {
        return addMany(context, [candidate], options);
    }

    function addMany(
        context: FallbackScopeRef,
        candidates: ServiceIdRef[],
        options?: FallbackMutationOptions,
    ): FallbackEditorState {
        const existing = getScope(context);
        const merged = [...existing];

        const insertAt =
            typeof options?.index === "number"
                ? clamp(options.index, 0, merged.length)
                : undefined;

        const incoming = normalizeCandidateList(candidates, true).filter(
            (id) => !merged.some((x) => String(x) === String(id)),
        );

        if (insertAt === undefined) {
            merged.push(...incoming);
        } else {
            merged.splice(insertAt, 0, ...incoming);
        }

        return replace(context, merged, options);
    }

    function remove(
        context: FallbackScopeRef,
        candidate: ServiceIdRef,
    ): FallbackEditorState {
        const next = getScope(context).filter(
            (id) => String(id) !== String(candidate),
        );
        return writeScope(context, next);
    }

    function replace(
        context: FallbackScopeRef,
        candidates: ServiceIdRef[],
        options?: FallbackMutationOptions,
    ): FallbackEditorState {
        const strict = !!options?.strict;
        const normalized = normalizeCandidateList(candidates, true);
        const checked = check(context, normalized);
        const next = strict ? checked.allowed : normalized;
        return writeScope(context, next);
    }

    function clear(context: FallbackScopeRef): FallbackEditorState {
        return writeScope(context, []);
    }

    function eligible(
        context: FallbackScopeRef,
        opt?: {
            exclude?: ServiceIdRef[];
            unique?: boolean;
            limit?: number;
        },
    ): ServiceIdRef[] {
        if (!props) return [];

        if (context.scope === "global") {
            return getEligibleFallbacks({
                primary: context.primary,
                services,
                fallbacks: current,
                settings,
                props,
                exclude: opt?.exclude,
                unique: opt?.unique,
                limit: opt?.limit,
            });
        }

        const info = getFallbackRegistrationInfo(props, context.nodeId);
        if (!info.primary) return [];

        return getEligibleFallbacks({
            primary: info.primary,
            nodeId: context.nodeId,
            tagId: info.tagContexts[0],
            services,
            fallbacks: current,
            settings,
            props,
            exclude: opt?.exclude,
            unique: opt?.unique,
            limit: opt?.limit,
        });
    }

    function writeScope(
        context: FallbackScopeRef,
        nextList: ServiceIdRef[],
    ): FallbackEditorState {
        const next = cloneFallbacks(current);

        if (context.scope === "global") {
            next.global ??= {};
            if (nextList.length) {
                next.global[context.primary] = [...nextList];
            } else {
                delete next.global[context.primary];
                if (!Object.keys(next.global).length) delete next.global;
            }
        } else {
            next.nodes ??= {};
            if (nextList.length) {
                next.nodes[context.nodeId] = [...nextList];
            } else {
                delete next.nodes[context.nodeId];
                if (!Object.keys(next.nodes).length) delete next.nodes;
            }
        }

        current = next;
        return state();
    }

    return {
        state,
        value,
        reset,
        get,
        getScope,
        check,
        add,
        addMany,
        remove,
        replace,
        clear,
        eligible,
    };
}

/* -------------------------------- helpers ------------------------------- */

function cloneFallbacks(input?: ServiceFallback): ServiceFallback {
    return {
        ...(input?.nodes ? { nodes: cloneRecordArray(input.nodes) } : {}),
        ...(input?.global ? { global: cloneRecordArray(input.global) } : {}),
    };
}

function cloneRecordArray<T extends string | number>(
    input: Record<string | number, T[]>,
): Record<string | number, T[]> {
    const out: Record<string | number, T[]> = {};
    for (const [k, v] of Object.entries(input)) out[k] = [...(v ?? [])];
    return out;
}

function sameFallbacks(a?: ServiceFallback, b?: ServiceFallback): boolean {
    return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
}

function normalizeCandidateList(
    input: ServiceIdRef[],
    preserveOrder: boolean,
): ServiceIdRef[] {
    const out: ServiceIdRef[] = [];
    for (const item of input ?? []) {
        if (!isValidServiceIdRef(item)) continue;
        const exists = out.some((x) => String(x) === String(item));
        if (exists) continue;
        out.push(item);
    }
    return preserveOrder ? out : out;
}

function isValidServiceIdRef(value: unknown): value is ServiceIdRef {
    return (
        (typeof value === "number" && Number.isFinite(value)) ||
        (typeof value === "string" && value.trim().length > 0)
    );
}

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

/**
 * Mirrors primaryForNode(...) semantics from core/fallback.ts:
 * - tag.id => tag.service_id
 * - option.id => option.service_id
 * - option tag contexts => bind_id array of parent field
 */
function getNodeRegistrationInfo(
    props: ServiceProps,
    nodeId: string,
): NodeRegistrationInfo {
    const tag = props.filters.find((t) => t.id === nodeId);
    if (tag) {
        if (!isValidServiceIdRef((tag as Tag).service_id)) {
            return { ok: false, reasons: ["no_primary"] };
        }
        return {
            ok: true,
            primary: (tag as Tag).service_id as any,
            tagContexts: [tag.id],
        };
    }

    const hit = findOptionOwner(props.fields, nodeId);
    if (!hit) {
        return { ok: false, reasons: ["node_not_found"] };
    }

    if (!isValidServiceIdRef((hit.option as FieldOption).service_id)) {
        return { ok: false, reasons: ["no_primary"] };
    }

    return {
        ok: true,
        primary: (hit.option as FieldOption).service_id as any,
        tagContexts: bindIdsToArray(hit.field.bind_id),
    };
}

function findOptionOwner(
    fields: Field[],
    optionId: string,
): { field: Field; option: FieldOption } | null {
    for (const field of fields) {
        for (const option of field.options ?? []) {
            if (option.id === optionId) return { field, option };
        }
    }
    return null;
}

function bindIdsToArray(v: string | string[] | undefined): string[] {
    if (Array.isArray(v)) return v.filter(Boolean);
    return v ? [v] : [];
}

function mapDiagReason(reason: unknown): FallbackCheckReason {
    switch (String(reason)) {
        case "unknown_service":
            return "unknown_service";
        case "no_primary":
            return "no_primary";
        case "rate_violation":
            return "rate_violation";
        case "constraint_mismatch":
            return "constraint_mismatch";
        case "cycle":
            return "cycle";
        case "no_tag_context":
            return "no_tag_context";
        default:
            return "node_not_found";
    }
}
