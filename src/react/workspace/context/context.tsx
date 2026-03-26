import React, {
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { CanvasAPI } from "@/react";
import { Builder, BuilderOptions, createBuilder } from "@/core";
import type { CanvasOptions, CanvasState } from "@/schema/canvas-types";
import type { CanvasBackendOptions } from "../../canvas/backend";
import type { EditorSnapshot, ServiceProps } from "@/schema";
import { useWorkspaceMaybe } from ".";

const Ctx = createContext<CanvasAPI | null>(null);

type CanvasProviderManagedProps = {
    api: CanvasAPI;
    children: ReactNode;
};

type CanvasProviderWorkspaceProps = {
    children: ReactNode;
    builderOpts?: BuilderOptions;
    canvasOpts?: CanvasOptions & CanvasBackendOptions;
    attachToWorkspace?: boolean;
};

type CanvasProviderProps =
    | CanvasProviderManagedProps
    | CanvasProviderWorkspaceProps;

type BootSectionStatus = "idle" | "loading" | "success" | "error";

export function CanvasProvider(props: CanvasProviderProps) {
    if ("api" in props) {
        return <Ctx.Provider value={props.api}>{props.children}</Ctx.Provider>;
    }

    return <CanvasProviderWorkspaceRuntime {...props} />;
}

function CanvasProviderWorkspaceRuntime({
    children,
    builderOpts,
    canvasOpts,
    attachToWorkspace = true,
}: CanvasProviderWorkspaceProps) {
    const ws = useWorkspaceMaybe();

    if (!attachToWorkspace || !ws) {
        throw new Error(
            "CanvasProvider: no `api` provided and no Workspace context available. " +
                "Either pass an `api` prop or render within <WorkspaceProvider>.",
        );
    }

    const snapshotSection = ws.boot.sections.snapshotBody;
    const currentBranchId = ws.branches.currentId;
    const snapshotData = ws.snapshot.data as EditorSnapshot | undefined;
    const initialProps = snapshotData?.props as ServiceProps | undefined;

    const hasMountedOnceRef = useRef(false);

    const canMountCanvas =
        ws.boot.isBooting === false &&
        snapshotSection.status === "success" &&
        initialProps != null;

    const debug = "";

    const resolvedBuilderOpts: BuilderOptions | undefined = useMemo(() => {
        const svc = ws.services.data as unknown;
        const hasMap =
            svc != null &&
            typeof svc === "object" &&
            !Array.isArray(svc as unknown[]);

        return hasMap
            ? {
                  ...(builderOpts ?? {}),
                  serviceMap: svc as BuilderOptions["serviceMap"],
              }
            : builderOpts;
    }, [builderOpts, ws.services.data]);

    if (canMountCanvas) {
        hasMountedOnceRef.current = true;
    }

    if (!canMountCanvas && !hasMountedOnceRef.current) {
        return (
            <>
                {debug}
                <WorkspaceBootScreen boot={ws.boot} />
            </>
        );
    }

    if (!canMountCanvas) {
        return (
            <>
                {debug}
                <WorkspaceBootOverlay boot={ws.boot} />
                <CanvasShellPlaceholder />
            </>
        );
    }

    const mountKey = currentBranchId ?? "workspace-canvas";

    return (
        <>
            {debug}
            <CanvasProviderOwned
                key={mountKey}
                initialSnapshot={snapshotData!}
                canvasOpts={canvasOpts}
                builderOpts={resolvedBuilderOpts}
            >
                {children}
            </CanvasProviderOwned>
        </>
    );
}

function CanvasProviderOwned({
    children,
    initialSnapshot,
    canvasOpts,
    builderOpts,
}: {
    children: ReactNode;
    initialSnapshot: EditorSnapshot;
    canvasOpts?: CanvasOptions & CanvasBackendOptions;
    builderOpts?: BuilderOptions;
}) {
    const { api } = useCanvasOwned(
        initialSnapshot.props,
        canvasOpts,
        builderOpts,
    );

    const hydrationReady = useHydrateEditorSnapshot(api, initialSnapshot);

    return (
        <Ctx.Provider value={api}>
            {hydrationReady ? children : null}
        </Ctx.Provider>
    );
}

export function useCanvasAPI(): CanvasAPI {
    const api = useContext(Ctx);
    if (!api) {
        throw new Error("useCanvasAPI must be used within <CanvasProvider>");
    }
    return api;
}

export function useCanvasFromBuilder(
    builder: Builder,
    opts?: CanvasOptions & CanvasBackendOptions,
): CanvasAPI {
    useDevWarnOnOptsChurn(opts);

    const lastOptsRef = useRef<
        (CanvasOptions & CanvasBackendOptions) | undefined
    >(undefined);

    const stableOpts =
        opts &&
        lastOptsRef.current &&
        shallowEqualOpts(lastOptsRef.current, opts)
            ? lastOptsRef.current
            : (lastOptsRef.current = opts);

    const api = useMemo(
        () => new CanvasAPI(builder, stableOpts),
        [builder, stableOpts],
    );

    useEffect(() => {
        return () => {
            api.dispose?.();
        };
    }, [api]);

    return api;
}

export function useCanvasFromExisting(api: CanvasAPI): CanvasAPI {
    return api;
}

const NO_SNAPSHOT_HYDRATION_KEY = "__no_snapshot__";

function useHydrateEditorSnapshot(
    api: CanvasAPI,
    snapshot?: EditorSnapshot,
): boolean {
    const fallbackIdentityRef = useRef(
        `snapshot:fallback:${Math.random().toString(36).slice(2)}`,
    );
    const hydratedIdentityRef = useRef<string>(NO_SNAPSHOT_HYDRATION_KEY);
    const [hydrationReady, setHydrationReady] = useState(false);
    const targetHydrationIdentity = useMemo(() => {
        if (!snapshot?.props) return NO_SNAPSHOT_HYDRATION_KEY;
        return getSnapshotHydrationIdentity(snapshot, fallbackIdentityRef.current);
    }, [snapshot]);

    useLayoutEffect(() => {
        if (snapshot?.props) {
            const shouldHydrate =
                hydratedIdentityRef.current !== targetHydrationIdentity;
            if (shouldHydrate) {
                hydrateEditorFromSnapshot(api, snapshot);
                hydratedIdentityRef.current = targetHydrationIdentity;
            }
        }

        if (!hydrationReady) {
            // Gate children only until the first hydration pass completes.
            // Do not flip this back to false on later snapshot updates.
            setHydrationReady(true);
        }
    }, [api, hydrationReady, snapshot, targetHydrationIdentity]);

    return hydrationReady;
}

function getSnapshotHydrationIdentity(
    snapshot: EditorSnapshot,
    fallbackIdentity: string,
): string {
    const meta = snapshot.meta as Record<string, unknown> | undefined;
    const snapshotId = meta?.snapshot_id ?? meta?.snapshotId;
    const versionId = meta?.version_id ?? meta?.versionId;
    const branchId = meta?.branch_id ?? meta?.branchId;

    if (
        snapshotId != null ||
        versionId != null ||
        branchId != null
    ) {
        return [
            String(snapshotId ?? ""),
            String(versionId ?? ""),
            String(branchId ?? ""),
        ].join("|");
    }

    return fallbackIdentity;
}

function hydrateEditorFromSnapshot(api: CanvasAPI, snapshot: EditorSnapshot) {
    api.refreshGraph();

    hydrateCatalog(api, snapshot);
    hydrateCanvasLayout(api, snapshot.layout?.canvas);
}

function hydrateCatalog(api: CanvasAPI, snapshot: EditorSnapshot) {
    if (snapshot.catalog) {
        api.editor.setCatalog(snapshot.catalog);
        return;
    }

    api.editor.clearCatalog();
}

function hydrateCanvasLayout(api: CanvasAPI, canvas?: CanvasState) {
    if (!canvas) return;
    const current = api.snapshot();

    if (
        canvas.positions &&
        hasPositionDelta(canvas.positions, current.positions)
    ) {
        api.setPositions(canvas.positions);
    }

    if (canvas.viewport && !sameViewport(canvas.viewport, current.viewport)) {
        api.setViewport(canvas.viewport);
    }

    const currentSelection = api.getSelection().map(String);
    if (canvas.selection) {
        const ids = Array.isArray(canvas.selection)
            ? canvas.selection
            : Array.from(canvas.selection);

        if (ids.length > 0) {
            if (!sameIdSet(ids.map(String), currentSelection)) {
                api.select(ids.map(String));
            }
        } else if (currentSelection.length > 0) {
            api.clearSelection();
        }
    } else if (currentSelection.length > 0) {
        api.clearSelection();
    }

    if ("highlighted" in (canvas as any)) {
        const highlighted = (canvas as any).highlighted;
        const ids = highlighted
            ? Array.isArray(highlighted)
                ? highlighted
                : Array.from(highlighted)
            : [];
        const currentIds = Array.from(current.highlighted ?? []).map(String);
        const nextIds = ids.map(String);
        if (!sameIdSet(nextIds, currentIds)) {
            api.setHighlighted(nextIds);
        }
    }

    if ("hoverId" in canvas) {
        const nextHoverId = (canvas as any).hoverId;
        if ((current as any).hoverId !== nextHoverId) {
            api.setHover(nextHoverId);
        }
    }
}

function hasPositionDelta(
    next: Record<string, { x: number; y: number }>,
    current: Record<string, { x: number; y: number }>,
): boolean {
    for (const id of Object.keys(next)) {
        const nextPos = next[id];
        const currentPos = current[id];
        if (
            !currentPos ||
            currentPos.x !== nextPos.x ||
            currentPos.y !== nextPos.y
        ) {
            return true;
        }
    }
    return false;
}

function sameViewport(
    a?: { x?: number; y?: number; zoom?: number },
    b?: { x?: number; y?: number; zoom?: number },
): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.x === b.x && a.y === b.y && a.zoom === b.zoom;
}

function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
    if (a.length !== b.length) return false;
    const set = new Set(a);
    for (const id of b) {
        if (!set.has(id)) return false;
    }
    return true;
}

function WorkspaceBootScreen({
    boot,
}: {
    boot: {
        isBooting: boolean;
        totalSections: number;
        completedSections: number;
        sections: Record<
            string,
            {
                status: BootSectionStatus;
                error?: { message?: string } | null;
            }
        >;
    };
}) {
    const sections = getOrderedBootSections(boot.sections);
    const percent =
        boot.totalSections > 0
            ? (boot.completedSections / boot.totalSections) * 100
            : 0;

    return (
        <div className="flex min-h-screen items-center justify-center bg-white px-6 py-10 dark:bg-slate-950">
            <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-5">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                        Workspace boot
                    </div>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Loading Service Builder
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {boot.completedSections} of {boot.totalSections}{" "}
                        sections completed
                    </p>
                </div>

                <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                        className="h-full rounded-full bg-blue-600 transition-all"
                        style={{ width: `${percent}%` }}
                    />
                </div>

                <div className="grid gap-2">
                    {sections.map(({ key, status, error }) => (
                        <div
                            key={key}
                            className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800"
                        >
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                {formatBootSection(key)}
                            </div>

                            <div className="flex items-center gap-2">
                                {error?.message ? (
                                    <span className="max-w-[18rem] truncate text-xs text-rose-500">
                                        {error.message}
                                    </span>
                                ) : null}
                                <BootStatusBadge status={status} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function WorkspaceBootOverlay({
    boot,
}: {
    boot: {
        isBooting: boolean;
        totalSections: number;
        completedSections: number;
    };
}) {
    if (!boot.isBooting) return null;

    return (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3">
            <div className="pointer-events-auto inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-sm shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-600" />
                <span className="text-slate-700 dark:text-slate-200">
                    Refreshing workspace… {boot.completedSections}/
                    {boot.totalSections}
                </span>
            </div>
        </div>
    );
}

function CanvasShellPlaceholder() {
    return <div className="min-h-screen bg-white dark:bg-slate-950" />;
}

function BootStatusBadge({ status }: { status: BootSectionStatus }) {
    if (status === "success") {
        return (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                Loaded
            </span>
        );
    }

    if (status === "error") {
        return (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                Failed
            </span>
        );
    }

    if (status === "loading") {
        return (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                Loading
            </span>
        );
    }

    return (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Pending
        </span>
    );
}

function getOrderedBootSections(
    sections: Record<
        string,
        {
            status: BootSectionStatus;
            error?: { message?: string } | null;
        }
    >,
) {
    const order = [
        "authors",
        "permissions",
        "branches",
        "services",
        "participants",
        "templates",
        "snapshotPointers",
        "snapshotBody",
        "policies",
        "comments",
    ];

    return order
        .filter((key) => key in sections)
        .map((key) => ({
            key,
            status: sections[key]?.status ?? "idle",
            error: sections[key]?.error ?? null,
        }));
}

function formatBootSection(section: string) {
    switch (section) {
        case "snapshotPointers":
            return "Snapshot pointers";
        case "snapshotBody":
            return "Snapshot body";
        default:
            return section.charAt(0).toUpperCase() + section.slice(1);
    }
}

function shallowEqualOpts(
    a?: CanvasOptions & CanvasBackendOptions,
    b?: CanvasOptions & CanvasBackendOptions,
) {
    if (a === b) return true;
    if (!a || !b) return false;

    const aKeys = Object.keys(a) as (keyof (CanvasOptions &
        CanvasBackendOptions))[];
    const bKeys = Object.keys(b) as (keyof (CanvasOptions &
        CanvasBackendOptions))[];

    if (aKeys.length !== bKeys.length) return false;

    for (const k of aKeys) {
        if ((a as any)[k] !== (b as any)[k]) return false;
    }

    return true;
}

function useDevWarnOnOptsChurn(opts?: CanvasOptions & CanvasBackendOptions) {
    const rawRef = useRef<typeof opts>(undefined);
    const churnCountRef = useRef(0);
    const lastWindowStartRef = useRef<number>(Date.now());
    const warnedRef = useRef(false);

    useEffect(() => {
        // @ts-ignore
        if (window.SITE?.env === "production") return;

        const now = Date.now();

        if (now - lastWindowStartRef.current > 2000) {
            lastWindowStartRef.current = now;
            churnCountRef.current = 0;
        }

        if (rawRef.current !== opts) {
            churnCountRef.current += 1;
            rawRef.current = opts;
        }

        if (!warnedRef.current && churnCountRef.current >= 5) {
            warnedRef.current = true;
            console.warn(
                "[digital-service-ui-builder] useCanvasFromBuilder: `opts` is changing identity frequently. " +
                    "Wrap your options in useMemo to avoid unnecessary API re-instantiation.",
            );
        }
    });
}

type UseCanvasOwnedReturn = {
    api: CanvasAPI;
    builder: Builder;
};

export function useCanvasOwned(
    initialProps?: ServiceProps,
    canvasOpts?: CanvasOptions & CanvasBackendOptions,
    builderOpts?: BuilderOptions,
): UseCanvasOwnedReturn {
    const builderRef = useRef<Builder>();
    const builderOptsRef = useRef<BuilderOptions | undefined>(builderOpts);
    const loadedOnceRef = useRef<boolean>(false);

    if (!builderRef.current) {
        builderRef.current = createBuilder(builderOptsRef.current);

        if (initialProps) {
            builderRef.current.load(initialProps);
            loadedOnceRef.current = true;
        }
        // @ts-ignore
    } else if (window.SITE?.env !== "production") {
        if (builderOptsRef.current !== builderOpts) {
            console.warn(
                "[useCanvasOwned] builderOpts changed after init; new values are ignored. " +
                    "If you need to recreate the builder, remount the hook (e.g. change a React key).",
            );
            builderOptsRef.current = builderOpts;
        }
    }

    const builder = builderRef.current!;

    useEffect(() => {
        if (!loadedOnceRef.current && initialProps) {
            builderRef.current!.load(initialProps);
            loadedOnceRef.current = true;
        }
    }, [initialProps]);

    const lastCanvasOptsRef = useRef<typeof canvasOpts>();

    const stableCanvasOpts = useMemo(() => {
        if (!lastCanvasOptsRef.current) {
            lastCanvasOptsRef.current = canvasOpts;
            return canvasOpts;
        }

        const a = canvasOpts ?? {};
        const b = lastCanvasOptsRef.current ?? {};
        const same = Object.keys({ ...a, ...b }).every(
            (k) => (a as any)[k] === (b as any)[k],
        );

        if (same) return lastCanvasOptsRef.current;

        lastCanvasOptsRef.current = canvasOpts;
        return canvasOpts;
    }, [canvasOpts]);

    const api = useMemo(
        () => new CanvasAPI(builder, stableCanvasOpts),
        [builder, stableCanvasOpts],
    );

    useEffect(() => {
        return () => {
            api.dispose?.();
        };
    }, [api]);

    return { api, builder };
}
