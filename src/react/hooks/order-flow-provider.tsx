// src/react/hooks/order-flow-provider.tsx
import React, {
    createContext,
    forwardRef,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";

import { FormProvider, Provider, useFormApi } from "@/react";
import type { Registry as InputRegistryConfig } from "../inputs/registry";

import { type Builder, type BuilderOptions, createBuilder } from "@/core";

import type { ServiceProps, Tag } from "@/schema";
import type { DgpServiceCapability, DgpServiceMap } from "@/schema/provider";
import type { OrderSnapshot, Scalar } from "@/schema/order";
import type { FallbackSettings } from "@/schema/validation";

import { Selection } from "../canvas/selection";

const ROOT_TAG_ID = "t:root";

/* ───────────────────────── Types ───────────────────────── */

export type OrderFlowInit = {
    mode?: "prod" | "dev";
    /** required service map used for snapshot building / rules */
    services: DgpServiceMap;
    /** fallback policy overrides */
    fallback?: FallbackSettings;
    /** hydrate initial state from snapshot */
    hydrateFrom?: OrderSnapshot;
    /** initial tag (ignored if hydrateFrom exists and provides tag) */
    initialTagId?: string;
    /** default quantity used by snapshot builder (default 1) */
    hostDefaultQuantity?: number;
    /** selection resolver (optional) */
    resolveService?: (id: number | string) => DgpServiceCapability | undefined;
    /**
     * Host props provided to further enhance the nodes data
     */
    ctx?: Record<string, unknown>;

    normalizeRate?(rate: number): number
};

type ProviderFlow = {
    builder: Builder;
    selection?: Selection;
};

export type OrderFlowProviderProps = {
    /**
     * Optional at mount time.
     * If absent, call initialize(...) later (via ref OR hook API).
     */
    serviceProps?: ServiceProps;
    builder?: Builder;
    flow?: ProviderFlow;

    builderOptions?: BuilderOptions;

    /** optional selection override (if not passed in flow) */
    selection?: Selection;

    /** Host input registry (maps kind/variant → components) */
    registry?: InputRegistryConfig;

    /** Optional now (deferred init supported). */
    init?: OrderFlowInit;

    children?: ReactNode;
};

export type OrderFlowInitializeParams = {
    serviceProps?: ServiceProps;
    builder?: Builder;
    flow?: ProviderFlow;

    builderOptions?: BuilderOptions;
    selection?: Selection;

    init: OrderFlowInit;
};

export type OrderFlowHandle = {
    /** whether provider has enough info to run */
    ready: () => boolean;

    /** (re)initialize the provider */
    initialize: (params: OrderFlowInitializeParams) => void;

    getActiveTag: () => string | undefined;
    selectTag: (tagId: string) => void;

    getVisibleGroup: () => ReturnType<Selection["visibleGroup"]>;
    getSelectionIds: () => string[];
    clearSelection: () => void;

    /** Apply snapshot into selection + form values/selections */
    setSnapshot: (snap: OrderSnapshot, opts?: { clearFirst?: boolean }) => void;

    /** Reset tag + clear fields */
    reset: (opts?: { keepTag?: boolean }) => void;

    refresh: () => void;
};

/* ───────────────────────── Context ───────────────────────── */

type NormalizedInit = Required<
    Pick<OrderFlowInit, "mode" | "hostDefaultQuantity">
> &
    OrderFlowInit;

type EnsureReadyResult = {
    builder: Builder;
    selection: Selection;
    init: NormalizedInit;
};

type CtxShape = {
    builder: Builder | null;
    selection: Selection | null;

    activeTagId?: string;
    setActiveTag: (id: string) => void;

    init: NormalizedInit | null;

    /** Form API from FormProvider (always available) */
    formApi: ReturnType<typeof useFormApi>;

    /** fallback policy (owned here; used by hook) */
    fallbackPolicy: FallbackSettings;
    setFallbackPolicy: (next: FallbackSettings) => void;

    /** imperative helpers exposed to hook */
    setSnapshot: (snap: OrderSnapshot, opts?: { clearFirst?: boolean }) => void;
    reset: (opts?: { keepTag?: boolean }) => void;

    /** guards */
    ready: () => boolean;
    ensureReady: (op?: string) => EnsureReadyResult;

    /** init API */
    initialize: (params: OrderFlowInitializeParams) => void;
};

const OrderFlowCtx = createContext<CtxShape | null>(null);

export function useOrderFlowContext(): CtxShape {
    const ctx = useContext(OrderFlowCtx);
    if (!ctx)
        throw new Error(
            "useOrderFlowContext must be used within <OrderFlowProvider>",
        );
    return ctx;
}

/* ───────────────────────── helpers ───────────────────────── */

function findDefaultTagId(tags: Tag[]): string | undefined {
    if (!tags?.length) return undefined;
    const hasRoot = tags.some((t) => t.id === ROOT_TAG_ID);
    return hasRoot ? ROOT_TAG_ID : tags[0]!.id;
}

/** Snapshot.inputs.form is keyed by field.name; map -> fieldId for FormProvider initial */
function mapSnapshotFormToFieldIds(
    builder: Builder,
    snap: OrderSnapshot,
): Record<string, Scalar | Scalar[]> {
    const byFieldId: Record<string, Scalar | Scalar[]> = {};
    const form = snap.inputs?.form ?? {};
    const fields = builder.getProps().fields ?? [];

    const nameToIds = new Map<string, string[]>();
    for (const f of fields) {
        if (!f.name) continue;
        const arr = nameToIds.get(f.name) ?? [];
        arr.push(f.id);
        nameToIds.set(f.name, arr);
    }

    for (const [name, value] of Object.entries(form)) {
        for (const fid of nameToIds.get(name) ?? []) {
            byFieldId[fid] = value as Scalar | Scalar[];
        }
    }

    return byFieldId;
}

function makeDefaultFallback(
    mode: "prod" | "dev",
    patch?: FallbackSettings,
): FallbackSettings {
    return {
        requireConstraintFit: true,
        ratePolicy: { kind: "lte_primary" },
        selectionStrategy: "priority",
        mode: mode === "dev" ? "dev" : "strict",
        ...(patch ?? {}),
    };
}

function normalizeInit(init: OrderFlowInit): NormalizedInit {
    const mode: "prod" | "dev" = init.mode ?? "prod";
    const hostDefaultQuantity = Number.isFinite(init.hostDefaultQuantity ?? 1)
        ? Number(init.hostDefaultQuantity ?? 1)
        : 1;
    return { ...init, mode, hostDefaultQuantity };
}

/* ───────────────────────── Bridge ───────────────────────── */
/**
 * This component MUST live inside <FormProvider> so it can call useFormApi()
 * and provide OrderFlowCtx synchronously on the first render.
 */
function OrderFlowCtxBridge(props: {
    ctxValue: Omit<CtxShape, "formApi">;
    formApiRef: React.MutableRefObject<ReturnType<typeof useFormApi> | null>;
    children?: ReactNode;
}) {
    const formApi = useFormApi();
    props.formApiRef.current = formApi; // sync (render-time) ref

    return (
        <OrderFlowCtx.Provider value={{ ...props.ctxValue, formApi }}>
            {props.children}
        </OrderFlowCtx.Provider>
    );
}

/* ───────────────────────── Component ───────────────────────── */

export const OrderFlowProvider = forwardRef<
    OrderFlowHandle,
    OrderFlowProviderProps
>(function OrderFlowProvider(
    {
        flow,
        builder: builderProp,
        serviceProps,
        builderOptions,
        selection: selectionProp,
        registry,
        init,
        children,
    },
    ref,
) {
    // deferred init storage
    const builderRef = useRef<Builder | null>(null);
    const selectionRef = useRef<Selection | null>(null);
    const initRef = useRef<NormalizedInit | null>(null);
    const unsubRef = useRef<null | (() => void)>(null);

    // Form API ref (render-time set by bridge)
    const formApiRef = useRef<ReturnType<typeof useFormApi> | null>(null);

    // active tag tracking
    const [activeTagId, setActiveTagId] = useState<string | undefined>(
        undefined,
    );

    // fallback policy state
    const [fallbackPolicy, setFallbackPolicy] = useState<FallbackSettings>(() =>
        makeDefaultFallback("prod"),
    );

    // to re-render when initialize() is called
    const [, force] = useState(0);
    const bump = () => force((x) => x + 1);

    const resolveBuilder = useCallback(
        (p: {
            flow?: ProviderFlow;
            builder?: Builder;
            serviceProps?: ServiceProps;
            builderOptions?: BuilderOptions;
        }) => {
            if (p.flow?.builder) return p.flow.builder;
            if (p.builder) return p.builder;

            if (p.serviceProps) {
                const b = createBuilder(p.builderOptions ?? {});
                b.load(p.serviceProps);
                return b;
            }

            return null;
        },
        [],
    );

    useEffect(() => {
        return () => {
            if (unsubRef.current) unsubRef.current();
        };
    }, []);


    const resolveSelection = useCallback(
        (
            b: Builder,
            nInit: NormalizedInit,
            p: { flow?: ProviderFlow; selection?: Selection },
        ) => {
            return (
                p.flow?.selection ??
                p.selection ??
                new Selection(b, {
                    env: "client",
                    rootTagId: ROOT_TAG_ID,
                    resolveService: nInit.resolveService,
                })
            );
        },
        [],
    );

    const ready = useCallback(
        () =>
            !!builderRef.current && !!selectionRef.current && !!initRef.current,
        [],
    );

    const ensureReady = useCallback((op?: string): EnsureReadyResult => {
        const b = builderRef.current;
        const s = selectionRef.current;
        const i = initRef.current;

        if (!b || !s || !i) {
            const hint = op ? ` (${op})` : "";
            throw new Error(
                `OrderFlowProvider is not initialized${hint}. Call initialize(...) or pass init + serviceProps/builder.`,
            );
        }
        return { builder: b, selection: s, init: i };
    }, []);

    const wireSelectionListener = useCallback((sel: Selection) => {
        setActiveTagId(sel.currentTag());
        return sel.onChange(() => setActiveTagId(sel.currentTag()));
    }, []);

    const initialize = useCallback(
        (params: OrderFlowInitializeParams) => {
            const b = resolveBuilder(params);
            if (!b) {
                throw new Error(
                    "OrderFlowProvider.initialize: requires `serviceProps` or `builder`/`flow.builder`.",
                );
            }

            const nInit = normalizeInit(params.init);
            const sel = resolveSelection(b, nInit, {
                flow: params.flow,
                selection: params.selection,
            });

            builderRef.current = b;
            selectionRef.current = sel;
            initRef.current = nInit;

            setFallbackPolicy(makeDefaultFallback(nInit.mode, nInit.fallback));

            // ✅ bind listener immediately (and replace any previous listener)
            if (unsubRef.current) unsubRef.current();
            unsubRef.current = sel.onChange(() =>
                setActiveTagId(sel.currentTag()),
            );

            // ✅ choose initial tag (hydrate -> init -> root -> first)
            const tags = b.getProps().filters ?? [];
            const hydratedTag = nInit.hydrateFrom?.selection?.tag;
            const initialTag = nInit.hydrateFrom
                ? hydratedTag
                : (nInit.initialTagId ?? findDefaultTagId(tags));

            if (initialTag) sel.replace(initialTag);
            else if (tags.length) sel.replace(tags[0]!.id);

            // ✅ set activeTagId synchronously right now
            setActiveTagId(sel.currentTag());

            // ✅ late-init hydration: MUST be imperative (FormProvider.initial won't re-run)
            const api = formApiRef.current;

            if (api && nInit.hydrateFrom) {
                // selections are already fieldId-keyed
                const selMap = nInit.hydrateFrom.inputs?.selections ?? {};
                for (const [fid, oids] of Object.entries(selMap)) {
                    api.setSelections(fid, oids ?? []);
                }

                // form is keyed by field.name -> map to fieldId(s)
                const valuesByFieldId = mapSnapshotFormToFieldIds(
                    b,
                    nInit.hydrateFrom,
                );
                for (const [fid, v] of Object.entries(valuesByFieldId)) {
                    api.set(fid, v as Scalar | Scalar[]);
                }
            }

            bump();
        },
        [resolveBuilder, resolveSelection],
    );

    // auto initialize from initial props if possible
    useEffect(() => {
        if (ready()) return;
        if (!init) return;

        const b = resolveBuilder({
            flow,
            builder: builderProp,
            serviceProps,
            builderOptions,
        });
        if (!b) return;

        initialize({
            flow,
            builder: builderProp,
            serviceProps,
            builderOptions,
            selection: selectionProp,
            init,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // attach selection listener whenever selection changes
    useEffect(() => {
        const sel = selectionRef.current;
        if (!sel) return;
        return wireSelectionListener(sel);
    }, [wireSelectionListener, force]);

    const setActiveTag = useCallback(
        (id: string) => {
            const { selection } = ensureReady("setActiveTag");
            selection.replace(id);
            setActiveTagId(id);
        },
        [ensureReady],
    );

    const clearAllFields = useCallback(() => {
        const api = formApiRef.current;
        if (!api) return;

        const b = builderRef.current;
        if (!b) return;

        const fields = b.getProps().fields ?? [];
        for (const f of fields) {
            api.set(f.id, undefined as unknown as Scalar);
            api.setSelections(f.id, []);
        }
    }, []);

    const setSnapshot = useCallback(
        (snap: OrderSnapshot, opts?: { clearFirst?: boolean }) => {
            const api = formApiRef.current;
            if (!api) return;

            const { builder, selection } = ensureReady("setSnapshot");

            const clearFirst = opts?.clearFirst ?? true;

            const tag = snap.selection?.tag;
            if (tag) selection.replace(tag);

            if (clearFirst) clearAllFields();

            const sel = snap.inputs?.selections ?? {};
            for (const [fid, oids] of Object.entries(sel))
                api.setSelections(fid, oids ?? []);

            const valuesByFieldId = mapSnapshotFormToFieldIds(builder, snap);
            for (const [fid, v] of Object.entries(valuesByFieldId))
                api.set(fid, v as Scalar | Scalar[]);
        },
        [clearAllFields, ensureReady],
    );

    const reset = useCallback(
        (opts?: { keepTag?: boolean }) => {
            const keepTag = opts?.keepTag ?? false;

            const { builder, selection } = ensureReady("reset");

            if (!keepTag) {
                const tags = builder.getProps().filters ?? [];
                const def = findDefaultTagId(tags) ?? tags[0]?.id;
                if (def) selection.replace(def);
            }

            clearAllFields();
        },
        [clearAllFields, ensureReady],
    );

    const getVisibleGroup = useCallback(
        () => ensureReady("getVisibleGroup").selection.visibleGroup(),
        [ensureReady],
    );
    const getSelectionIds = useCallback(
        () => Array.from(ensureReady("getSelectionIds").selection.all()),
        [ensureReady],
    );
    const clearSelection = useCallback(
        () => ensureReady("clearSelection").selection.clear(),
        [ensureReady],
    );

    // initial FormProvider state (only if initialized + hydrateFrom exists)
    const initialValues = useMemo(() => {
        const b = builderRef.current;
        const i = initRef.current;
        if (!b || !i?.hydrateFrom) return {};
        return mapSnapshotFormToFieldIds(b, i.hydrateFrom);
    }, [force]);

    const initialSelections = useMemo(() => {
        const i = initRef.current;
        if (!i?.hydrateFrom) return {};
        return i.hydrateFrom.inputs?.selections ?? {};
    }, [force]);

    useImperativeHandle(
        ref,
        (): OrderFlowHandle => ({
            ready,
            initialize,

            getActiveTag: () => activeTagId,
            selectTag: (id: string) => setActiveTag(id),

            getVisibleGroup,
            getSelectionIds,
            clearSelection,

            setSnapshot,
            reset,
            refresh: () => setActiveTagId(selectionRef.current?.currentTag()),
        }),
        [
            activeTagId,
            clearSelection,
            getSelectionIds,
            getVisibleGroup,
            initialize,
            ready,
            reset,
            setActiveTag,
            setSnapshot,
        ],
    );

    return (
        <Provider initialRegistry={registry}>
            <FormProvider
                initial={{
                    values: initialValues,
                    selections: initialSelections,
                }}
            >
                <OrderFlowCtxBridge
                    formApiRef={formApiRef}
                    ctxValue={{
                        builder: builderRef.current,
                        selection: selectionRef.current,

                        activeTagId,
                        setActiveTag,

                        init: initRef.current,

                        fallbackPolicy,
                        setFallbackPolicy,

                        setSnapshot,
                        reset,

                        ready,
                        ensureReady,

                        initialize,
                    }}
                >
                    {children}
                </OrderFlowCtxBridge>
            </FormProvider>
        </Provider>
    );
});
