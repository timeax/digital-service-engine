import * as React from "react";

import type {
    BackendError,
    BackendResult,
    Branch,
    Commit,
    Draft,
} from "../../backend";
import type {
    RunResult,
    WorkspaceBootSection,
    WorkspaceBootSectionState,
    WorkspaceBootState,
} from "../types";
import type { BackendRuntime } from "../runtime/use-backend-runtime";

const ALL_SECTIONS: readonly WorkspaceBootSection[] = [
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

const BLOCKING_SECTIONS: readonly WorkspaceBootSection[] = [
    "authors",
    "permissions",
    "branches",
    "services",
    "participants",
    "templates",
    "snapshotPointers",
    "snapshotBody",
    "policies",
];

function createInitialSections(): Record<
    WorkspaceBootSection,
    WorkspaceBootSectionState
> {
    return {
        authors: { status: "idle" },
        permissions: { status: "idle" },
        branches: { status: "idle" },
        services: { status: "idle" },
        participants: { status: "idle" },
        templates: { status: "idle" },
        snapshotPointers: { status: "idle" },
        snapshotBody: { status: "idle" },
        policies: { status: "idle" },
        comments: { status: "idle" },
    };
}

function createNoBranchError(section: WorkspaceBootSection): BackendError {
    return {
        code: "no_branch",
        message: `No current branch available to load ${section}.`,
    };
}

function collectErrors(
    sections: Readonly<Record<WorkspaceBootSection, WorkspaceBootSectionState>>,
): Partial<Record<WorkspaceBootSection, BackendError>> {
    const errors: Partial<Record<WorkspaceBootSection, BackendError>> = {};
    for (const section of ALL_SECTIONS) {
        const error = sections[section].error;
        if (error) {
            errors[section] = error;
        }
    }
    return errors;
}

function getRunErrors(result: RunResult): BackendError[] {
    return result.ok ? [] : result.errors;
}

function resolveBranchId(
    branches: readonly Branch[],
    preferredId?: string,
): string | undefined {
    if (preferredId && branches.some((branch) => branch.id === preferredId)) {
        return preferredId;
    }
    return branches.find((branch) => branch.isMain)?.id ?? branches[0]?.id;
}

async function toVoidResult<T>(
    result: Promise<BackendResult<T>>,
): Promise<BackendResult<void>> {
    const res = await result;
    if (!res.ok) {
        return res;
    }
    return { ok: true, value: undefined };
}

export interface UseWorkspaceBootParams {
    readonly workspaceId: string;
    readonly actorId: string;
    readonly preferredBranchId?: string;
    readonly hasInitialData: boolean;
    readonly runtime: BackendRuntime;
    readonly getBranchesState: () => readonly Branch[];
    readonly getCurrentBranchId: () => string | undefined;
    readonly setCurrentBranchId: (id: string) => void;
    readonly refreshAuthors: () => Promise<BackendResult<readonly unknown[]>>;
    readonly refreshPermissions: () => Promise<
        BackendResult<Readonly<Record<string, boolean>>>
    >;
    readonly refreshBranches: () => Promise<BackendResult<readonly Branch[]>>;
    readonly refreshServices: (
        branchId?: string,
    ) => Promise<
        BackendResult<Readonly<Record<string, unknown>>>
    >;
    readonly refreshPermissionsWithBranch: (
        branchId?: string,
    ) => Promise<BackendResult<Readonly<Record<string, boolean>>>>;
    readonly refreshParticipants: (
        branchId: string,
    ) => Promise<BackendResult<readonly unknown[]>>;
    readonly refreshTemplates: (
        branchId: string,
    ) => Promise<BackendResult<readonly unknown[]>>;
    readonly refreshSnapshotPointers: (
        branchId: string,
    ) => Promise<BackendResult<Readonly<{ head?: Commit; draft?: Draft }>>>;
    readonly loadSnapshotBody: (
        branchId: string,
    ) => Promise<BackendResult<void>>;
    readonly refreshPolicies: (
        branchId: string,
    ) => Promise<BackendResult<readonly unknown[]>>;
    readonly refreshComments: (
        branchId: string,
    ) => Promise<BackendResult<readonly unknown[]>>;
}

export interface WorkspaceBootController {
    readonly boot: WorkspaceBootState;
    readonly refreshAll: (opts?: { strict?: boolean }) => Promise<RunResult>;
    readonly refreshBranchContext: (
        opts?: Readonly<{
            branchId?: string;
            strict?: boolean;
            includeWorkspaceData?: boolean;
        }>,
    ) => Promise<void>;
    readonly refreshSnapshotPointers: (
        opts?: Readonly<{ branchId?: string; strict?: boolean }>,
    ) => Promise<void>;
}

export function useWorkspaceBoot(
    params: UseWorkspaceBootParams,
): WorkspaceBootController {
    const {
        workspaceId,
        actorId,
        preferredBranchId,
        hasInitialData,
        runtime,
        getBranchesState,
        getCurrentBranchId,
        setCurrentBranchId,
        refreshAuthors,
        refreshPermissions,
        refreshPermissionsWithBranch,
        refreshBranches,
        refreshServices,
        refreshParticipants,
        refreshTemplates,
        refreshSnapshotPointers,
        loadSnapshotBody,
        refreshPolicies,
        refreshComments,
    } = params;

    const [sections, setSections] = React.useState(createInitialSections);
    const [lastError, setLastError] = React.useState<BackendError | undefined>(
        undefined,
    );
    const runIdRef = React.useRef(0);
    const refreshAllRef = React.useRef<
        ((opts?: { strict?: boolean }) => Promise<RunResult>) | null
    >(null);

    const markLoading = React.useCallback(
        (section: WorkspaceBootSection): void => {
            setSections((prev) => ({
                ...prev,
                [section]: {
                    status: "loading",
                    updatedAt: runtime.now(),
                },
            }));
        },
        [runtime],
    );

    const markResult = React.useCallback(
        (section: WorkspaceBootSection, result: BackendResult<unknown>): void => {
            if (result.ok) {
                setSections((prev) => ({
                    ...prev,
                    [section]: {
                        status: "success",
                        updatedAt: runtime.now(),
                    },
                }));
                return;
            }

            setLastError(result.error);
            setSections((prev) => ({
                ...prev,
                [section]: {
                    status: "error",
                    error: result.error,
                    updatedAt: runtime.now(),
                },
            }));
        },
        [runtime],
    );

    const runSection = React.useCallback(
        async <T,>(
            section: WorkspaceBootSection,
            task: () => Promise<BackendResult<T>>,
        ): Promise<BackendResult<T>> => {
            markLoading(section);
            try {
                const result = await task();
                markResult(section, result as BackendResult<unknown>);
                return result;
            } catch (error) {
                const backendError = runtime.toBackendError(error);
                setLastError(backendError);
                setSections((prev) => ({
                    ...prev,
                    [section]: {
                        status: "error",
                        error: backendError,
                        updatedAt: runtime.now(),
                    },
                }));
                return { ok: false, error: backendError };
            }
        },
        [markLoading, markResult, runtime],
    );

    const runGroup = React.useCallback(
        async (
            tasks: ReadonlyArray<
                readonly [WorkspaceBootSection, () => Promise<BackendResult<unknown>>]
            >,
            strict: boolean,
        ): Promise<RunResult> => {
            const errors: BackendError[] = [];

            for (const [section, task] of tasks) {
                const result = await runSection(section, task);
                if (!result.ok) {
                    errors.push(result.error);
                    if (strict) {
                        break;
                    }
                }
            }

            return errors.length > 0 ? { ok: false, errors } : { ok: true };
        },
        [runSection],
    );

    const resolveActiveBranch = React.useCallback(
        (candidateId?: string): string | undefined => {
            const branches = getBranchesState();
            const branchId = resolveBranchId(
                branches,
                candidateId ?? getCurrentBranchId() ?? preferredBranchId,
            );
            if (branchId) {
                setCurrentBranchId(branchId);
            }
            return branchId;
        },
        [
            getBranchesState,
            getCurrentBranchId,
            preferredBranchId,
            setCurrentBranchId,
        ],
    );

    const markBranchScopedNoBranch = React.useCallback((): RunResult => {
        const errors: BackendError[] = [];
        for (const section of BLOCKING_SECTIONS) {
            if (!["participants", "templates", "snapshotPointers", "snapshotBody", "policies"].includes(section)) {
                continue;
            }
            const error = createNoBranchError(section);
            errors.push(error);
            setLastError(error);
            setSections((prev) => ({
                ...prev,
                [section]: {
                    status: "error",
                    error,
                    updatedAt: runtime.now(),
                },
            }));
        }
        return { ok: false, errors };
    }, [runtime]);

    const refreshBranchContext = React.useCallback(
        async (
            opts?: Readonly<{
                branchId?: string;
                strict?: boolean;
                includeWorkspaceData?: boolean;
            }>,
        ): Promise<void> => {
            const strict = opts?.strict ?? false;
            const tasks: Array<
                readonly [WorkspaceBootSection, () => Promise<BackendResult<unknown>>]
            > = [];
            const branchId =
                resolveActiveBranch(opts?.branchId) ?? opts?.branchId;

            if (opts?.includeWorkspaceData ?? true) {
                tasks.push(["authors", refreshAuthors]);
                tasks.push([
                    "permissions",
                    () => refreshPermissionsWithBranch(branchId),
                ]);
                tasks.push(["services", () => refreshServices(branchId)]);
            }

            if (!branchId) {
                markBranchScopedNoBranch();
                return;
            }

            tasks.push([
                "participants",
                () => refreshParticipants(branchId),
            ]);
            tasks.push(["templates", () => refreshTemplates(branchId)]);
            tasks.push([
                "snapshotPointers",
                () => refreshSnapshotPointers(branchId),
            ]);
            tasks.push(["policies", () => refreshPolicies(branchId)]);
            tasks.push(["snapshotBody", () => loadSnapshotBody(branchId)]);

            await runGroup(tasks, strict);
            void runSection("comments", () => refreshComments(branchId));
        },
        [
            loadSnapshotBody,
            markBranchScopedNoBranch,
            refreshAuthors,
            refreshComments,
            refreshParticipants,
            refreshPermissions,
            refreshPolicies,
            refreshServices,
            refreshSnapshotPointers,
            refreshTemplates,
            resolveActiveBranch,
            runGroup,
            runSection,
        ],
    );

    const refreshAll = React.useCallback(
        async (opts?: { strict?: boolean }): Promise<RunResult> => {
            const runId = ++runIdRef.current;
            const strict = opts?.strict ?? false;
            const workspaceErrors: BackendError[] = [];

            const authorsResult = await runSection("authors", refreshAuthors);
            if (!authorsResult.ok) {
                workspaceErrors.push(authorsResult.error);
                if (strict) {
                    return { ok: false, errors: workspaceErrors };
                }
            }

            const permissionsResult = await runSection(
                "permissions",
                refreshPermissions,
            );
            if (!permissionsResult.ok) {
                workspaceErrors.push(permissionsResult.error);
                if (strict) {
                    return { ok: false, errors: workspaceErrors };
                }
            }

            const branchesResult = await runSection("branches", refreshBranches);
            if (!branchesResult.ok) {
                workspaceErrors.push(branchesResult.error);
                if (strict) {
                    return { ok: false, errors: workspaceErrors };
                }
            }

            const servicesResult = await runSection("services", refreshServices);
            if (!servicesResult.ok) {
                workspaceErrors.push(servicesResult.error);
                if (strict) {
                    return { ok: false, errors: workspaceErrors };
                }
            }

            if (runIdRef.current !== runId) {
                return workspaceErrors.length > 0
                    ? { ok: false, errors: workspaceErrors }
                    : { ok: true };
            }

            const resolvedBranches =
                branchesResult.ok && branchesResult.value
                    ? (branchesResult.value as readonly Branch[])
                    : getBranchesState();
            const branchId = resolveBranchId(
                resolvedBranches,
                preferredBranchId ?? getCurrentBranchId(),
            );
            if (branchId) {
                setCurrentBranchId(branchId);
            }
            if (!branchId) {
                const noBranchResult = markBranchScopedNoBranch();
                if (workspaceErrors.length > 0) {
                    return {
                        ok: false,
                        errors: [
                            ...workspaceErrors,
                            ...getRunErrors(noBranchResult),
                        ],
                    };
                }
                return noBranchResult;
            }

            const branchResult = await runGroup(
                [
                    ["participants", () => refreshParticipants(branchId)],
                    ["templates", () => refreshTemplates(branchId)],
                    [
                        "snapshotPointers",
                        () => refreshSnapshotPointers(branchId),
                    ],
                    ["policies", () => refreshPolicies(branchId)],
                    ["snapshotBody", () => loadSnapshotBody(branchId)],
                ],
                strict,
            );

            if (runIdRef.current === runId) {
                void runSection("comments", () => refreshComments(branchId));
            }

            if (workspaceErrors.length > 0 || !branchResult.ok) {
                const branchErrors = !branchResult.ok ? branchResult.errors : [];
                return {
                    ok: false,
                    errors: [...workspaceErrors, ...branchErrors],
                };
            }

            return { ok: true };
        },
        [
            loadSnapshotBody,
            markBranchScopedNoBranch,
            preferredBranchId,
            refreshAuthors,
            refreshBranches,
            refreshComments,
            refreshParticipants,
            refreshPermissions,
            refreshPermissionsWithBranch,
            refreshPolicies,
            refreshServices,
            refreshSnapshotPointers,
            refreshTemplates,
            getBranchesState,
            getCurrentBranchId,
            runGroup,
            runSection,
            setCurrentBranchId,
        ],
    );

    const retrySection = React.useCallback(
        async (
            section: WorkspaceBootSection,
        ): Promise<BackendResult<void>> => {
            const branchId = resolveActiveBranch();

            switch (section) {
                case "authors":
                    return toVoidResult(refreshAuthors());
                case "permissions":
                    return toVoidResult(refreshPermissions());
                case "branches":
                    return toVoidResult(refreshBranches());
                case "services":
                    return toVoidResult(refreshServices());
                case "participants":
                    return branchId
                        ? toVoidResult(
                              runSection(section, () =>
                                  refreshParticipants(branchId),
                              ),
                          )
                        : { ok: false, error: createNoBranchError(section) };
                case "templates":
                    return branchId
                        ? toVoidResult(
                              runSection(section, () =>
                                  refreshTemplates(branchId),
                              ),
                          )
                        : { ok: false, error: createNoBranchError(section) };
                case "snapshotPointers":
                    return branchId
                        ? toVoidResult(
                              runSection(section, () =>
                                  refreshSnapshotPointers(branchId),
                              ),
                          )
                        : { ok: false, error: createNoBranchError(section) };
                case "snapshotBody":
                    return branchId
                        ? toVoidResult(
                              runSection(section, () =>
                                  loadSnapshotBody(branchId),
                              ),
                          )
                        : { ok: false, error: createNoBranchError(section) };
                case "policies":
                    return branchId
                        ? toVoidResult(
                              runSection(section, () =>
                                  refreshPolicies(branchId),
                              ),
                          )
                        : { ok: false, error: createNoBranchError(section) };
                case "comments":
                    return branchId
                        ? toVoidResult(
                              runSection(section, () =>
                                  refreshComments(branchId),
                              ),
                          )
                        : { ok: false, error: createNoBranchError(section) };
                default:
                    return {
                        ok: false,
                        error: {
                            code: "invalid_section",
                            message: `Unknown boot section: ${String(section)}.`,
                        },
                    };
            }
        },
        [
            loadSnapshotBody,
            refreshAuthors,
            refreshBranches,
            refreshComments,
            refreshParticipants,
            refreshPermissions,
            refreshPolicies,
            refreshServices,
            refreshSnapshotPointers,
            refreshTemplates,
            resolveActiveBranch,
            runSection,
        ],
    );

    const refreshSnapshotPointersOnly = React.useCallback(
        async (
            opts?: Readonly<{ branchId?: string; strict?: boolean }>,
        ): Promise<void> => {
            const branchId = resolveActiveBranch(opts?.branchId);
            if (!branchId) {
                markBranchScopedNoBranch();
                return;
            }
            await runGroup(
                [["snapshotPointers", () => refreshSnapshotPointers(branchId)]],
                opts?.strict ?? false,
            );
        },
        [markBranchScopedNoBranch, refreshSnapshotPointers, resolveActiveBranch, runGroup],
    );

    React.useEffect(() => {
        refreshAllRef.current = refreshAll;
    }, [refreshAll]);

    React.useEffect(() => {
        setSections(createInitialSections());
        setLastError(undefined);
        void refreshAllRef.current?.();
    }, [actorId, workspaceId]);

    const boot = React.useMemo<WorkspaceBootState>(() => {
        const errorsBySection = collectErrors(sections);
        const statuses = ALL_SECTIONS.map((section) => sections[section].status);
        const completedSections = statuses.filter((status) => status !== "idle" && status !== "loading").length;
        const succeededSections = statuses.filter((status) => status === "success").length;
        const failedSections = statuses.filter((status) => status === "error").length;
        const isBooting = statuses.some((status) => status === "loading");
        const isReady = BLOCKING_SECTIONS.every(
            (section) => sections[section].status === "success",
        );
        const hasErrors = failedSections > 0;
        const hasPartialFailure = succeededSections > 0 && failedSections > 0;
        const isLiveConfirmed = isReady;

        return {
            sections,
            isBooting,
            isReady,
            hasErrors,
            hasPartialFailure,
            lastError,
            errorsBySection,
            isSeededView: hasInitialData && !isLiveConfirmed,
            isLiveConfirmed,
            completedSections,
            succeededSections,
            failedSections,
            totalSections: ALL_SECTIONS.length,
            retryAll: refreshAll,
            retrySection,
        };
    }, [hasInitialData, lastError, refreshAll, retrySection, sections]);

    return React.useMemo(
        () => ({
            boot,
            refreshAll,
            refreshBranchContext,
            refreshSnapshotPointers: refreshSnapshotPointersOnly,
        }),
        [boot, refreshAll, refreshBranchContext, refreshSnapshotPointersOnly],
    );
}
