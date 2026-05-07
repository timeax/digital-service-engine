// src/react/workspace/context/provider/provider.tsx
import * as React from "react";
import type {
    LiveOptions,
    MergeResult,
    Result,
    TemplatesListParams,
} from "@/react/workspace";
import { WorkspaceContext } from "@/react/workspace";
import type { DgpServiceMap } from "@/schema/provider";
import type { WorkspaceAPI, WorkspaceProviderProps } from "./types";
import { LIVE_OFF } from "./helpers";

import { useBackendRuntime } from "./runtime/use-backend-runtime";

import { useAuthorsSlice } from "./slices/use-authors-slice";
import { usePermissionsSlice } from "./slices/use-permissions-slice";
import { useBranchesSlice } from "./slices/use-branches-slice";
import { useTemplatesSlice } from "./slices/use-templates-slice";
import { useServicesSlice } from "./slices/use-services-slice";
import { useSnapshotsSlice } from "./slices/use-snapshots-slice";
import { useCommentsSlice } from "./slices/use-comments-slice";
import { useBranchCache } from "./compose/use-branch-cache";
import { useLivePolling } from "./compose/use-live-polling";
import { usePoliciesSlice } from "@/react/workspace/context/provider/slices/use-policies-slice";
import { useWorkspaceBoot } from "./compose/use-workspace-boot";

/* ---------------- provider (thin composition root) ---------------- */

export function WorkspaceProvider(
    props: WorkspaceProviderProps,
): React.JSX.Element {
    const {
        backend,
        actor,
        initial,
        ensureMain = true,
        live: liveProp,
        autosaveMs = 9000,
        autoAutosave = true,
        children,
        liveAdapters,
        liveDebounceMs = 250,
    } = props;

    const runtime = useBackendRuntime();

    const workspaceId: string = backend.info.id;
    const live: LiveOptions = liveProp ?? LIVE_OFF;

    const authorsSlice = useAuthorsSlice({
        backend,
        workspaceId,
        initialAuthors: initial?.authors ?? null,
        runtime,
    });

    const permissionsSlice = usePermissionsSlice({
        backend,
        workspaceId,
        actor,
        initialPermissions: initial?.permissions ?? null,
        runtime,
    });

    const branchesSlice = useBranchesSlice({
        backend,
        workspaceId,
        ensureMain,
        initialBranches: initial?.branches ?? [],
        initialMainId: initial?.mainId,
        initialCurrentId: initial?.currentBranchId ?? initial?.mainId,
        initialParticipants: initial?.participants ?? null,
        runtime,
    });

    const getCurrentBranchId = React.useCallback(
        (): string | undefined => branchesSlice.branches.currentId,
        [branchesSlice.branches.currentId],
    );

    const templatesSlice = useTemplatesSlice({
        backend,
        workspaceId,
        getCurrentBranchId,
        initialTemplates: initial?.templates ?? null,
        runtime,
    });

    const servicesSlice = useServicesSlice({
        backend,
        workspaceId,
        initialServices: (initial?.services as DgpServiceMap | null) ?? null,
        runtime,
    });

    const snapshotsSlice = useSnapshotsSlice({
        backend,
        workspaceId,
        actor,
        getCurrentBranchId,
        initialSnapshot: initial?.snapshot
            ? {
                  schema_version: initial.snapshot.schema_version,
                  data: initial.snapshot.data as any,
              }
            : null,
        initialHead: initial?.head,
        initialDraft: initial?.draft,
        autosaveMs,
        autoAutosave,
        runtime,
    });

    const branchCache = useBranchCache(workspaceId);

    const comments = useCommentsSlice({
        backend: backend.comments,
        workspaceId,
        actorId: actor.id,
        getCurrentBranchId,
        initialThreads: initial?.comments,
    });

    const policiesSlice = usePoliciesSlice({
        backend,
        workspaceId,
        actorId: actor.id,
        getCurrentBranchId,
        initialPolicies: initial?.policies ?? null,
        runtime,
    });

    const bootCtl = useWorkspaceBoot({
        workspaceId,
        actorId: actor.id,
        preferredBranchId: initial?.currentBranchId ?? initial?.mainId,
        hasInitialData: Boolean(
            initial?.authors ||
                initial?.permissions ||
                initial?.branches ||
                initial?.templates ||
                initial?.participants ||
                initial?.services ||
                initial?.snapshot ||
                initial?.policies ||
                initial?.comments,
        ),
        runtime,
        getBranchesState: () => branchesSlice.branches.data,
        getCurrentBranchId,
        setCurrentBranchId: branchesSlice.setCurrentBranchId,
        refreshAuthors: authorsSlice.refreshAuthors,
        refreshPermissions: permissionsSlice.refreshPermissions,
        refreshBranches: branchesSlice.refreshBranches,
        refreshServices: servicesSlice.refreshServices as () => Promise<any>,
        refreshParticipants: (branchId: string) =>
            branchesSlice.refreshParticipants({ branchId }),
        refreshTemplates: (branchId: string) =>
            templatesSlice.refreshTemplates({ branchId }),
        refreshSnapshotPointers: (branchId: string) =>
            snapshotsSlice.refreshSnapshotPointersForBranch(branchId) as any,
        loadSnapshotBody: async (branchId: string) => {
            const res = await snapshotsSlice.loadSnapshotForBranch(branchId);
            if (!res.ok) {
                return res;
            }
            return { ok: true, value: undefined };
        },
        refreshPolicies: (branchId: string) =>
            policiesSlice.refreshPolicies({ branchId }),
        refreshComments: (branchId: string) =>
            comments.refreshThreads({ branchId }),
    });

    const hasAnyData: boolean = Boolean(
        (authorsSlice.authors.data && authorsSlice.authors.data.length) ||
            (branchesSlice.branches.data &&
                branchesSlice.branches.data.length) ||
            (templatesSlice.templates.data &&
                templatesSlice.templates.data.length) ||
            (branchesSlice.participants.data &&
                branchesSlice.participants.data.length) ||
            snapshotsSlice.snapshot.data,
    );

    const liveCtl = useLivePolling({
        live,
        workspaceId,
        actor,
        hasAnyData,
        getCurrentBranchId: () => branchesSlice.branches.currentId,
        refreshAll: bootCtl.refreshAll,
        refreshBranchContext: bootCtl.refreshBranchContext,
        refreshSnapshotPointers: bootCtl.refreshSnapshotPointers,
        adapters: liveAdapters,
        debounceMs: liveDebounceMs,
    });

    const currentBranchIdRef = React.useRef<string | undefined>(
        branchesSlice.branches.currentId,
    );
    const currentSnapshotRef = React.useRef(snapshotsSlice.snapshot);

    React.useEffect(() => {
        currentBranchIdRef.current = branchesSlice.branches.currentId;
    }, [branchesSlice.branches.currentId]);

    React.useEffect(() => {
        currentSnapshotRef.current = snapshotsSlice.snapshot;
    }, [snapshotsSlice.snapshot]);

    /* ---------------- branch ops ---------------- */

    const setCurrentBranch = React.useCallback(
        (id: string): void => {
            const prevId: string | undefined = branchesSlice.branches.currentId;

            branchCache.switchBranch({
                workspaceId,
                nextId: id,
                prevId,
                templates: templatesSlice.templates,
                participants: branchesSlice.participants,
                snapshot: snapshotsSlice.snapshot,
                setTemplates: templatesSlice.__setTemplatesState,
                setParticipants: branchesSlice.__setParticipantsState,
                setSnapshot: snapshotsSlice.__setSnapshotState,
                resetTemplates: templatesSlice.resetTemplatesForBranch,
                resetParticipants: () => {
                    branchesSlice.__setParticipantsState((state) => ({
                        ...state,
                        data: null,
                        error: undefined,
                    }));
                },
                resetSnapshot: snapshotsSlice.resetSnapshotForBranch,
                setCurrentBranchId: branchesSlice.setCurrentBranchId,
                getCurrentBranchId: () => currentBranchIdRef.current,
                getCurrentSnapshot: () => currentSnapshotRef.current,
            });

            void bootCtl.refreshBranchContext({
                branchId: id,
                includeWorkspaceData: false,
            });
        },
        [
            branchesSlice.branches.currentId,
            branchesSlice.participants,
            branchesSlice.setCurrentBranchId,
            branchesSlice.__setParticipantsState,
            branchCache,
            bootCtl,
            snapshotsSlice.__setSnapshotState,
            snapshotsSlice.resetSnapshotForBranch,
            snapshotsSlice.snapshot,
            templatesSlice.__setTemplatesState,
            templatesSlice.resetTemplatesForBranch,
            templatesSlice.templates,
            workspaceId,
        ],
    );

    const createBranch = React.useCallback<WorkspaceAPI["createBranch"]>(
        async (name: string, opts?: Readonly<{ fromId?: string }>) => {
            const res = await backend.branches.create(workspaceId, name, opts);
            if (res.ok) {
                await branchesSlice.refreshBranches();
                setCurrentBranch(res.value.id);
            }
            return res;
        },
        [backend.branches, branchesSlice, setCurrentBranch, workspaceId],
    );

    const setMain = React.useCallback<WorkspaceAPI["setMain"]>(
        async (branchId: string) => {
            const res = await backend.branches.setMain(workspaceId, branchId);
            if (res.ok) {
                await branchesSlice.refreshBranches();
            }
            return res;
        },
        [backend.branches, branchesSlice, workspaceId],
    );

    const mergeBranch = React.useCallback<WorkspaceAPI["mergeBranch"]>(
        async (sourceId: string, targetId: string): Result<MergeResult> => {
            const res = await backend.branches.merge(
                workspaceId,
                sourceId,
                targetId,
            );

            if (res.ok) {
                await runtime.runTasks(
                    [
                        async () => {
                            await branchesSlice.refreshBranches();
                        },
                        async () => {
                            await bootCtl.refreshBranchContext();
                        },
                    ],
                    true,
                );
            }

            return res;
        },
        [backend.branches, bootCtl, branchesSlice, runtime, workspaceId],
    );

    const deleteBranch = React.useCallback<WorkspaceAPI["deleteBranch"]>(
        async (branchId: string) => {
            const res = await backend.branches.delete(workspaceId, branchId);
            if (res.ok) {
                const refreshed = await branchesSlice.refreshBranches();

                if (
                    refreshed.ok &&
                    branchesSlice.branches.currentId === branchId
                ) {
                    const fallback = refreshed.value.find(
                        (branch) => branch.id !== branchId,
                    )?.id;

                    if (fallback) {
                        setCurrentBranch(fallback);
                    }
                }
            }
            return res;
        },
        [backend.branches, branchesSlice, setCurrentBranch, workspaceId],
    );

    /* ---------------- cache invalidation ---------------- */

    const invalidate = React.useCallback<WorkspaceAPI["invalidate"]>(
        (keys) => {
            const setAll: boolean = !keys || keys.length === 0;

            if (setAll || keys?.includes("authors")) {
                authorsSlice.invalidateAuthors();
            }
            if (setAll || keys?.includes("permissions")) {
                permissionsSlice.invalidatePermissions();
            }
            if (setAll || keys?.includes("branches")) {
                branchesSlice.invalidateBranches();
            }
            if (setAll || keys?.includes("services")) {
                servicesSlice.invalidateServices();
            }

            if (setAll || keys?.includes("templates")) {
                templatesSlice.invalidateTemplates();
            }
            if (setAll || keys?.includes("participants")) {
                branchesSlice.invalidateParticipants();
            }

            if (
                setAll ||
                keys?.includes("templates") ||
                keys?.includes("participants") ||
                keys?.includes("snapshot")
            ) {
                branchCache.clear();
            }

            if (setAll || keys?.includes("policies")) {
                policiesSlice.invalidatePolicies();
            }
        },
        [
            authorsSlice,
            branchCache,
            branchesSlice,
            permissionsSlice,
            policiesSlice,
            servicesSlice,
            templatesSlice,
        ],
    );

    /* ---------------- memo API ---------------- */

    const api: WorkspaceAPI = React.useMemo<WorkspaceAPI>(
        () => ({
            info: backend.info,
            actor,
            boot: bootCtl.boot,

            authors: authorsSlice.authors,
            permissions: permissionsSlice.permissions,
            branches: branchesSlice.branches,

            templates: templatesSlice.templates,
            participants: branchesSlice.participants,
            services: servicesSlice.services,

            refresh: {
                all: bootCtl.refreshAll,
                authors: async () => {
                    await authorsSlice.refreshAuthors();
                },
                permissions: async () => {
                    await permissionsSlice.refreshPermissions();
                },
                branches: async () => {
                    await branchesSlice.refreshBranches();
                },
                services: async () => {
                    await servicesSlice.refreshServices();
                },
                branchContext: bootCtl.refreshBranchContext,
                templates: async (
                    params?: Partial<
                        Pick<TemplatesListParams, "branchId" | "since">
                    >,
                ) => {
                    return await templatesSlice.refreshTemplates(params);
                },
                participants: async (
                    params?: Partial<{
                        branchId: string;
                        since?: number | string;
                    }>,
                ) => {
                    await branchesSlice.refreshParticipants(params);
                },
                snapshotPointers: bootCtl.refreshSnapshotPointers,
                policies: async () => {
                    await policiesSlice.refreshPolicies();
                },
            },

            setCurrentBranch,

            createBranch,
            setMain,
            mergeBranch,
            deleteBranch,

            createTemplate: templatesSlice.createTemplate,
            updateTemplate: templatesSlice.updateTemplate,
            cloneTemplate: templatesSlice.cloneTemplate,
            publishTemplate: templatesSlice.publishTemplate,
            unpublishTemplate: templatesSlice.unpublishTemplate,
            deleteTemplate: templatesSlice.deleteTemplate,

            invalidate,

            live: {
                connected: liveCtl.connected,
                lastEventAt: liveCtl.lastEventAt,
                connect: liveCtl.connect,
                disconnect: liveCtl.disconnect,
            },

            snapshot: {
                state: snapshotsSlice.snapshot.state,
                saving: snapshotsSlice.snapshot.saving,
                dirty: snapshotsSlice.snapshot.dirty,
                head: snapshotsSlice.snapshot.head,
                draft: snapshotsSlice.snapshot.draft,
                schemaVersion: snapshotsSlice.snapshot.schemaVersion,
                data: snapshotsSlice.snapshot.data,
                lastSavedAt: snapshotsSlice.snapshot.lastSavedAt,
                lastDraftAt: snapshotsSlice.snapshot.lastDraftAt,

                set: snapshotsSlice.setSnapshotData,
                load: snapshotsSlice.loadSnapshot,
                refresh: async () => {
                    await snapshotsSlice.refreshSnapshotPointers();
                },

                autosave: snapshotsSlice.autosave,
                save: snapshotsSlice.save,
                publish: snapshotsSlice.publish,
                discardDraft: snapshotsSlice.discardDraft,
            },
            comments: {
                threads: comments.threads,
                refreshThreads: comments.refreshThreads,
                createThread: comments.createThread,
                addMessage: comments.addMessage,
                editMessage: comments.editMessage,
                deleteMessage: comments.deleteMessage,
                moveThread: comments.moveThread,
                resolveThread: comments.resolveThread,
                deleteThread: comments.deleteThread,
            },
            policies: policiesSlice,
        }),
        [
            actor,
            authorsSlice.authors,
            authorsSlice.refreshAuthors,
            backend.info,
            bootCtl,
            branchesSlice.branches,
            branchesSlice.participants,
            branchesSlice.refreshBranches,
            branchesSlice.refreshParticipants,
            comments,
            createBranch,
            deleteBranch,
            invalidate,
            liveCtl.connected,
            liveCtl.lastEventAt,
            mergeBranch,
            permissionsSlice.permissions,
            permissionsSlice.refreshPermissions,
            policiesSlice,
            servicesSlice.refreshServices,
            servicesSlice.services,
            setCurrentBranch,
            setMain,
            snapshotsSlice.autosave,
            snapshotsSlice.discardDraft,
            snapshotsSlice.loadSnapshot,
            snapshotsSlice.publish,
            snapshotsSlice.refreshSnapshotPointers,
            snapshotsSlice.save,
            snapshotsSlice.setSnapshotData,
            snapshotsSlice.snapshot,
            templatesSlice.createTemplate,
            templatesSlice.deleteTemplate,
            templatesSlice.publishTemplate,
            templatesSlice.refreshTemplates,
            templatesSlice.templates,
            templatesSlice.cloneTemplate,
            templatesSlice.unpublishTemplate,
            templatesSlice.updateTemplate,
        ],
    );

    return (
        <WorkspaceContext.Provider value={api}>
            {children}
        </WorkspaceContext.Provider>
    );
}
