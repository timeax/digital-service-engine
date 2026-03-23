// src/react/workspace/context/provider/slices/use-snapshots-slice.ts
import * as React from "react";
import type {
    Actor,
    BackendError,
    BackendResult,
    Commit,
    Draft,
    Result,
    SnapshotsLoadResult,
    WorkspaceBackend,
} from "../../backend";
import type { EditorSnapshot } from "@/schema";
import type { SnapshotSlice, WorkspaceAPI } from "@/react/workspace";
import type { BackendRuntime } from "../runtime/use-backend-runtime";

export interface SnapshotsSliceApi {
    readonly snapshot: SnapshotSlice;

    readonly loadSnapshotForBranch: (
        branchId: string,
        params?: Readonly<{ versionId?: string }>,
    ) => Result<SnapshotsLoadResult>;

    readonly loadSnapshot: WorkspaceAPI["snapshot"]["load"];
    readonly refreshSnapshotPointersForBranch: (
        branchId: string,
    ) => Promise<BackendResult<Readonly<{ head?: Commit; draft?: Draft }>>>;
    readonly refreshSnapshotPointers: () => Promise<
        BackendResult<Readonly<{ head?: Commit; draft?: Draft }>>
    >;

    readonly setSnapshotData: WorkspaceAPI["snapshot"]["set"];
    readonly autosave: WorkspaceAPI["snapshot"]["autosave"];
    readonly save: WorkspaceAPI["snapshot"]["save"];
    readonly publish: WorkspaceAPI["snapshot"]["publish"];
    readonly discardDraft: WorkspaceAPI["snapshot"]["discardDraft"];

    /** internal setters for branch-cache composition */
    readonly __setSnapshotState: React.Dispatch<
        React.SetStateAction<SnapshotSlice>
    >;

    readonly resetSnapshotForBranch: () => void;
}

function setSnapshotError(error: BackendError): {
    ok: false;
    error: BackendError;
} {
    return { ok: false, error };
}

function hasSnapshotProps(data: unknown): data is EditorSnapshot {
    if (!data || typeof data !== "object") return false;
    const props = (data as { props?: unknown }).props;
    return Boolean(props && typeof props === "object");
}

function hasUsableSnapshotPayload(input: {
    schemaVersion?: string;
    data?: unknown;
}): boolean {
    return (
        typeof input.schemaVersion === "string" &&
        input.schemaVersion.length > 0 &&
        hasSnapshotProps(input.data)
    );
}

function createClearedSnapshotState(): SnapshotSlice {
    return {
        schemaVersion: undefined,
        data: undefined,
        head: undefined,
        draft: undefined,
        state: "clean",
        saving: false,
        dirty: false,
        lastSavedAt: undefined,
        lastDraftAt: undefined,
    };
}

function normalizeSnapshotState(input: {
    schemaVersion?: string;
    data?: unknown;
    head?: Commit;
    draft?: Draft;
    state?: SnapshotSlice["state"];
    saving?: boolean;
    dirty?: boolean;
    lastSavedAt?: number;
    lastDraftAt?: number;
}): SnapshotSlice {
    if (!hasUsableSnapshotPayload(input)) {
        return createClearedSnapshotState();
    }

    return {
        schemaVersion: input.schemaVersion,
        data: input.data as EditorSnapshot,
        head: input.head,
        draft: input.draft,
        state: input.state ?? (input.draft ? "uncommitted" : "clean"),
        saving: input.saving ?? false,
        dirty: input.dirty ?? false,
        lastSavedAt: input.lastSavedAt,
        lastDraftAt: input.lastDraftAt,
    };
}

export interface UseSnapshotsSliceParams {
    readonly backend: WorkspaceBackend;
    readonly workspaceId: string;
    readonly actor: Actor;

    readonly getCurrentBranchId: () => string | undefined;

    readonly initialSnapshot?: {
        schema_version: string;
        data: EditorSnapshot;
    } | null;
    readonly initialHead?: Commit;
    readonly initialDraft?: Draft;

    readonly autosaveMs: number;
    readonly autoAutosave: boolean;

    readonly runtime: BackendRuntime;
}

export function useSnapshotsSlice(
    params: UseSnapshotsSliceParams,
): SnapshotsSliceApi {
    const {
        backend,
        workspaceId,
        actor,
        getCurrentBranchId,
        initialSnapshot,
        initialHead,
        initialDraft,
        autosaveMs,
        autoAutosave,
        runtime,
    } = params;

    const [snapshot, setSnapshot] = React.useState<SnapshotSlice>(() =>
        normalizeSnapshotState({
            schemaVersion: initialSnapshot?.schema_version,
            data: initialSnapshot?.data,
            head: initialHead,
            draft: initialDraft,
            state: initialDraft ? "uncommitted" : "clean",
            saving: false,
            dirty: false,
        }),
    );

    const autosaveTimerRef = React.useRef<number | null>(null);

    const loadSnapshotForBranch = React.useCallback(
        async (
            branchId: string,
            params?: Readonly<{ versionId?: string }>,
        ): Result<SnapshotsLoadResult> => {
            const res = await backend.snapshots.load({
                workspaceId,
                branchId,
                actorId: actor.id,
                versionId: params?.versionId,
            });

            if (res.ok) {
                const { head, draft, snapshot: snap } = res.value;
                setSnapshot(
                    normalizeSnapshotState({
                        schemaVersion: snap.schema_version,
                        data: snap.data,
                        head,
                        draft,
                        state: draft ? "uncommitted" : "clean",
                        saving: false,
                        dirty: false,
                        lastSavedAt: undefined,
                        lastDraftAt: undefined,
                    }),
                );
            }

            return res;
        },
        [backend.snapshots, workspaceId, actor.id],
    );

    const loadSnapshot = React.useCallback<WorkspaceAPI["snapshot"]["load"]>(
        async (params?: Readonly<{ versionId?: string }>) => {
            const branchId = getCurrentBranchId();
            if (!branchId) {
                return setSnapshotError({
                    code: "no_branch",
                    message: "No current branch to load snapshot from.",
                }) as unknown as Result<SnapshotsLoadResult>;
            }
            return loadSnapshotForBranch(branchId, params);
        },
        [getCurrentBranchId, loadSnapshotForBranch],
    );

    const setSnapshotData = React.useCallback<WorkspaceAPI["snapshot"]["set"]>(
        (
            updater: (curr: EditorSnapshot | undefined) => EditorSnapshot,
        ): void => {
            setSnapshot((s) => ({
                ...s,
                data: updater(s.data),
                state: s.draft ? "uncommitted" : "dirty",
                dirty: true,
            }));
        },
        [],
    );

    const refreshSnapshotPointersForBranch = React.useCallback(
        async (
            branchId: string,
        ): Promise<
            BackendResult<Readonly<{ head?: Commit; draft?: Draft }>>
        > => {
            const res = await backend.snapshots.refresh({
                workspaceId,
                branchId,
                actorId: actor.id,
                since: snapshot.lastSavedAt ?? snapshot.lastDraftAt,
            });

            if (!res.ok) return res;

            setSnapshot((s) => ({
                ...s,
                head: res.value.head ?? s.head,
                draft: res.value.draft,
                state: res.value.draft
                    ? "uncommitted"
                    : s.dirty
                      ? "dirty"
                      : "clean",
            }));
            return res;
        },
        [
            backend.snapshots,
            workspaceId,
            actor.id,
            snapshot.lastSavedAt,
            snapshot.lastDraftAt,
        ],
    );

    const refreshSnapshotPointers = React.useCallback(async (): Promise<
        BackendResult<Readonly<{ head?: Commit; draft?: Draft }>>
    > => {
        const branchId = getCurrentBranchId();
        if (!branchId) {
            return {
                ok: false,
                error: {
                    code: "no_branch",
                    message:
                        "No current branch to refresh snapshot pointers for.",
                },
            };
        }
        return refreshSnapshotPointersForBranch(branchId);
    }, [getCurrentBranchId, refreshSnapshotPointersForBranch]);

    const autosave = React.useCallback<
        WorkspaceAPI["snapshot"]["autosave"]
    >(async () => {
        const branchId = getCurrentBranchId();
        if (!branchId) {
            return setSnapshotError({
                code: "no_branch",
                message: "No current branch to autosave.",
            }) as any;
        }

        if (!hasUsableSnapshotPayload(snapshot)) {
            return setSnapshotError({
                code: "no_snapshot",
                message: "Nothing to autosave.",
            }) as any;
        }
        const schemaVersion = snapshot.schemaVersion as string;
        const data = snapshot.data as EditorSnapshot;

        const res = await backend.snapshots.autosave({
            workspaceId,
            branchId,
            actorId: actor.id,
            snapshot: {
                schema_version: schemaVersion,
                data,
            },
            etag: snapshot.draft?.etag,
        });

        if (res.ok) {
            setSnapshot((s) => ({
                ...s,
                draft: res.value.draft,
                state: "uncommitted",
                dirty: false,
                lastDraftAt: runtime.now(),
            }));
        }

        return res;
    }, [
        backend.snapshots,
        workspaceId,
        actor.id,
        getCurrentBranchId,
        snapshot.data,
        snapshot.schemaVersion,
        snapshot.draft?.etag,
        runtime,
    ]);

    const save = React.useCallback<WorkspaceAPI["snapshot"]["save"]>(
        async (message?: string) => {
            const branchId = getCurrentBranchId();
            if (!branchId) {
                return setSnapshotError({
                    code: "no_branch",
                    message: "No current branch to save.",
                }) as any;
            }

            if (!hasUsableSnapshotPayload(snapshot)) {
                return setSnapshotError({
                    code: "no_snapshot",
                    message: "Nothing to save.",
                }) as any;
            }
            const schemaVersion = snapshot.schemaVersion as string;
            const data = snapshot.data as EditorSnapshot;

            setSnapshot((s) => ({ ...s, state: "saving", saving: true }));

            const res = await backend.snapshots.save({
                workspaceId,
                branchId,
                actorId: actor.id,
                snapshot: {
                    schema_version: schemaVersion,
                    data,
                },
                message,
                draftId: snapshot.draft?.id,
                etag: snapshot.draft?.id
                    ? snapshot.draft?.etag
                    : snapshot.head?.etag,
            });

            if (res.ok) {
                const commit = res.value.commit;
                setSnapshot((s) => ({
                    ...s,
                    head: commit,
                    draft: undefined,
                    state: "clean",
                    saving: false,
                    dirty: false,
                    lastSavedAt: runtime.now(),
                }));
            } else {
                setSnapshot((s) => ({
                    ...s,
                    state: s.draft ? "uncommitted" : "dirty",
                    saving: false,
                }));
            }

            return res;
        },
        [
            backend.snapshots,
            workspaceId,
            actor.id,
            getCurrentBranchId,
            snapshot.data,
            snapshot.schemaVersion,
            snapshot.draft?.id,
            snapshot.head?.etag,
            runtime,
        ],
    );

    const publish = React.useCallback<WorkspaceAPI["snapshot"]["publish"]>(
        async (message?: string) => {
            const draftId = snapshot.draft?.id;
            if (!draftId) return save(message);

            const res = await backend.snapshots.publish({
                workspaceId,
                actorId: actor.id,
                draftId,
                message,
            });

            if (res.ok) {
                const commit = res.value.commit;
                setSnapshot((s) => ({
                    ...s,
                    head: commit,
                    draft: undefined,
                    state: "clean",
                    saving: false,
                    dirty: false,
                    lastSavedAt: runtime.now(),
                }));
            }

            return res;
        },
        [
            backend.snapshots,
            workspaceId,
            actor.id,
            snapshot.draft?.id,
            save,
            runtime,
        ],
    );

    const discardDraft = React.useCallback<
        WorkspaceAPI["snapshot"]["discardDraft"]
    >(async () => {
        const draftId = snapshot.draft?.id;
        if (!draftId) return { ok: true, value: undefined } as const;

        const res = await backend.snapshots.discard({
            workspaceId,
            actorId: actor.id,
            draftId,
        });

        if (res.ok) {
            setSnapshot((s) => ({
                ...s,
                draft: undefined,
                state: s.dirty ? "dirty" : "clean",
            }));
        }

        return res;
    }, [backend.snapshots, workspaceId, actor.id, snapshot.draft?.id]);

    // Autosave effect (same behavior as old provider)
    React.useEffect((): (() => void) | void => {
        if (!autoAutosave || !snapshot.dirty) return;

        if (autosaveTimerRef.current) {
            window.clearTimeout(autosaveTimerRef.current);
            autosaveTimerRef.current = null;
        }

        autosaveTimerRef.current = window.setTimeout(() => {
            void autosave();
            autosaveTimerRef.current = null;
        }, autosaveMs) as unknown as number;

        return (): void => {
            if (autosaveTimerRef.current) {
                window.clearTimeout(autosaveTimerRef.current);
                autosaveTimerRef.current = null;
            }
        };
    }, [snapshot.dirty, autosaveMs, autoAutosave, autosave]);

    const resetSnapshotForBranch = React.useCallback((): void => {
        setSnapshot(createClearedSnapshotState());
    }, []);

    const setSnapshotStateSafe = React.useCallback<
        React.Dispatch<React.SetStateAction<SnapshotSlice>>
    >((updater) => {
        setSnapshot((current) => {
            const next =
                typeof updater === "function"
                    ? (updater as (prev: SnapshotSlice) => SnapshotSlice)(
                          current,
                      )
                    : updater;

            return normalizeSnapshotState({
                schemaVersion: next.schemaVersion,
                data: next.data,
                head: next.head,
                draft: next.draft,
                state: next.state,
                saving: next.saving,
                dirty: next.dirty,
                lastSavedAt: next.lastSavedAt,
                lastDraftAt: next.lastDraftAt,
            });
        });
    }, []);

    return React.useMemo<SnapshotsSliceApi>(
        () => ({
            snapshot,
            loadSnapshotForBranch,
            loadSnapshot,
            refreshSnapshotPointersForBranch,
            refreshSnapshotPointers,
            setSnapshotData,
            autosave,
            save,
            publish,
            discardDraft,
            __setSnapshotState: setSnapshotStateSafe,
            resetSnapshotForBranch,
        }),
        [
            snapshot,
            loadSnapshotForBranch,
            loadSnapshot,
            refreshSnapshotPointersForBranch,
            refreshSnapshotPointers,
            setSnapshotData,
            autosave,
            save,
            publish,
            discardDraft,
            resetSnapshotForBranch,
            setSnapshotStateSafe,
        ],
    );
}
