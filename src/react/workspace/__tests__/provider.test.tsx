//@ts-nocheck
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { WorkspaceProvider, useWorkspace } from "../index";
import type {
    Actor,
    Author,
    BackendError,
    BackendResult,
    Branch,
    BranchParticipant,
    Commit,
    Draft,
    MergeResult,
    PermissionsMap,
    Result,
    ServiceSnapshot,
    ServicesInput,
    TemplatesListParams,
    FieldTemplate,
    WorkspaceBackend,
    WorkspaceInfo,
    SnapshotsLoadResult,
} from "../context/backend";
import type { WorkspaceAPI } from "@/react";
import type { DgpServiceMap } from "@/schema/provider";

/**
 * React’s act() warnings happen if the test environment doesn’t opt in.
 * This silences: “The current testing environment is not configured to support act(...)”
 */
(
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function ok<T>(value: T): BackendResult<T> {
    return { ok: true, value };
}

function err<T>(error: BackendError): BackendResult<T> {
    return { ok: false, error };
}

async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

function makeActor(): Actor {
    return { id: "actor-1", name: "Tester" };
}

function makeInfo(): WorkspaceInfo {
    return {
        id: "ws-1",
        name: "Workspace",
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
    };
}

function makeBranch(id: string, isMain: boolean): Branch {
    return {
        id,
        name: id,
        isMain,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
    };
}

type BackendMock = WorkspaceBackend & {
    readonly authors: WorkspaceBackend["authors"] & {
        readonly refresh: ReturnType<typeof vi.fn>;
    };
    readonly permissions: WorkspaceBackend["permissions"] & {
        readonly refresh: ReturnType<typeof vi.fn>;
    };
    readonly branches: WorkspaceBackend["branches"] & {
        readonly refresh: ReturnType<typeof vi.fn>;
    };
    readonly access: WorkspaceBackend["access"] & {
        readonly refreshParticipants: ReturnType<typeof vi.fn>;
    };
    readonly services: WorkspaceBackend["services"] & {
        readonly refresh: ReturnType<typeof vi.fn>;
    };
    readonly templates: WorkspaceBackend["templates"] & {
        readonly refresh: ReturnType<typeof vi.fn>;
    };
    readonly snapshots: WorkspaceBackend["snapshots"] & {
        readonly refresh: ReturnType<typeof vi.fn>;
    };
};

function makeBackendMock(): BackendMock {
    const info: WorkspaceInfo = makeInfo();

    const authorsRefresh = vi.fn<[string], Result<readonly Author[]>>(
        async (_workspaceId: string) => ok([] as readonly Author[]),
    );

    const permissionsRefresh = vi.fn<[string, Actor], Result<PermissionsMap>>(
        async (_workspaceId: string, _actor: Actor) => ok({} as PermissionsMap),
    );

    const branchesRefresh = vi.fn<[string], Result<readonly Branch[]>>(
        async (_workspaceId: string) =>
            ok([makeBranch("b1", true)] as readonly Branch[]),
    );

    const accessRefreshParticipants = vi.fn<
        [string, string, Readonly<{ since?: number | string }> | undefined],
        Result<readonly BranchParticipant[]>
    >(async (_ws: string, _branchId: string) =>
        ok([] as readonly BranchParticipant[]),
    );

    const servicesRefresh = vi.fn<
        [string, Readonly<{ since?: number | string }> | undefined],
        Result<ServicesInput>
    >(async (_ws: string, _params?: Readonly<{ since?: number | string }>) =>
        ok({} as DgpServiceMap),
    );

    const templatesRefresh = vi.fn<
        [Omit<TemplatesListParams, "q" | "tags" | "category">],
        Result<readonly FieldTemplate[]>
    >(async () => ok([] as readonly FieldTemplate[]));

    const snapshotsRefresh = vi.fn<
        [
            Readonly<{
                workspaceId: string;
                branchId: string;
                actorId: string;
                since?: number | string;
            }>,
        ],
        Result<Readonly<{ head?: Commit; draft?: Draft }>>
    >(async () => ok({}));

    const backend: BackendMock = {
        info,

        authors: {
            list: vi.fn<[string], Result<readonly Author[]>>(async () =>
                ok([] as readonly Author[]),
            ),
            get: vi.fn<[string], Result<Author | null>>(async () => ok(null)),
            refresh: authorsRefresh,
        },

        permissions: {
            get: vi.fn<[string, Actor], Result<PermissionsMap>>(async () =>
                ok({} as PermissionsMap),
            ),
            refresh: permissionsRefresh,
        },

        branches: {
            list: vi.fn<[string], Result<readonly Branch[]>>(async () =>
                ok([makeBranch("b1", true)] as readonly Branch[]),
            ),
            create: vi.fn<
                [string, string, Readonly<{ fromId?: string }> | undefined],
                Result<Branch>
            >(async (_workspaceId: string, name: string) =>
                ok(makeBranch(name, false)),
            ),
            setMain: vi.fn<[string, string], Result<Branch>>(
                async (_workspaceId: string, branchId: string) =>
                    ok(makeBranch(branchId, true)),
            ),
            merge: vi.fn<[string, string, string], Result<MergeResult>>(
                async (
                    _workspaceId: string,
                    sourceId: string,
                    targetId: string,
                ) => ok({ sourceId, targetId } as MergeResult),
            ),
            delete: vi.fn<[string, string], Result<void>>(async () =>
                ok(void 0),
            ),
            refresh: branchesRefresh,
        },

        access: {
            listParticipants: vi.fn<
                [string, string],
                Result<readonly BranchParticipant[]>
            >(async () => ok([] as readonly BranchParticipant[])),
            refreshParticipants: accessRefreshParticipants,
        },

        services: {
            get: vi.fn<[string], Result<ServicesInput>>(async () =>
                ok({} as DgpServiceMap),
            ),
            refresh: servicesRefresh,
        },

        templates: {
            list: vi.fn<
                [TemplatesListParams],
                Result<readonly FieldTemplate[]>
            >(async () => ok([] as readonly FieldTemplate[])),
            get: vi.fn<[string], Result<FieldTemplate | null>>(async () =>
                ok(null),
            ),
            getByKey: vi.fn<
                [string, string, string | undefined],
                Result<FieldTemplate | null>
            >(async () => ok(null)),
            create: vi.fn<[unknown], Result<FieldTemplate>>(async () =>
                ok({} as FieldTemplate),
            ),
            update: vi.fn<[string, unknown], Result<FieldTemplate>>(async () =>
                ok({} as FieldTemplate),
            ),
            clone: vi.fn<
                [Readonly<{ id?: string; key?: string }>, unknown],
                Result<FieldTemplate>
            >(async () => ok({} as FieldTemplate)),
            publish: vi.fn<[string], Result<FieldTemplate>>(async () =>
                ok({} as FieldTemplate),
            ),
            unpublish: vi.fn<[string], Result<FieldTemplate>>(async () =>
                ok({} as FieldTemplate),
            ),
            delete: vi.fn<[string], Result<void>>(async () => ok(void 0)),
            refresh: templatesRefresh,
        },

        snapshots: {
            load: vi.fn<
                [
                    Readonly<{
                        workspaceId: string;
                        branchId: string;
                        actorId: string;
                        versionId?: string;
                    }>,
                ],
                Result<SnapshotsLoadResult>
            >(async () => ok({} as SnapshotsLoadResult)),
            autosave: vi.fn<
                [
                    Readonly<{
                        workspaceId: string;
                        branchId: string;
                        actorId: string;
                        snapshot: ServiceSnapshot;
                        clientId?: string;
                        since?: number | string;
                        etag?: string;
                    }>,
                ],
                Result<Readonly<{ draft: Draft }>>
            >(async () => ok({ draft: {} as Draft })),
            save: vi.fn<
                [
                    Readonly<{
                        workspaceId: string;
                        branchId: string;
                        actorId: string;
                        snapshot: ServiceSnapshot;
                        message?: string;
                        clientId?: string;
                        etag?: string;
                    }>,
                ],
                Result<Readonly<{ commit: Commit }>>
            >(async () => ok({ commit: {} as Commit })),
            publish: vi.fn<
                [
                    Readonly<{
                        workspaceId: string;
                        branchId: string;
                        actorId: string;
                        snapshot: ServiceSnapshot;
                        message?: string;
                        clientId?: string;
                        etag?: string;
                    }>,
                ],
                Result<Readonly<{ commit: Commit }>>
            >(async () => ok({ commit: {} as Commit })),
            discard: vi.fn<
                [
                    Readonly<{
                        workspaceId: string;
                        branchId: string;
                        actorId: string;
                    }>,
                ],
                Result<void>
            >(async () => ok(void 0)),
            refresh: snapshotsRefresh,
        },
    };

    return backend;
}

describe("WorkspaceProvider (integration)", () => {
    let container: HTMLDivElement;
    let root: Root | null;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        if (root) {
            act(() => root?.unmount());
            root = null;
        }
        container.remove();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("refresh.all() calls workspace-wide refreshers then current-branch context refreshers (matching backend.ts contracts)", async () => {
        const backend: BackendMock = makeBackendMock();
        const actor: Actor = makeActor();

        let api: WorkspaceAPI | null = null;

        function Capture(): null {
            const ctx: WorkspaceAPI = useWorkspace();
            React.useEffect(() => {
                api = ctx;
            }, [ctx]);
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider
                    backend={backend}
                    actor={actor}
                    autoAutosave={false}
                    initial={{
                        branches: [makeBranch("b1", true)],
                        mainId: "b1",
                        currentBranchId: "b1",
                    }}
                >
                    <Capture />
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });

        expect(api).not.toBeNull();

        vi.clearAllMocks();

        await act(async () => {
            await api!.refresh.all({ strict: true });
            await flushMicrotasks();
        });

        const wsId: string = backend.info.id;

        // workspace-wide
        expect(backend.authors.refresh).toHaveBeenCalledWith(wsId);
        expect(backend.permissions.refresh).toHaveBeenCalledWith(wsId, actor);
        expect(backend.branches.refresh).toHaveBeenCalledWith(wsId);

        // IMPORTANT: backend.ts defines services.refresh(workspaceId, { since? })
        expect(backend.services.refresh).toHaveBeenCalledWith(wsId, {
            since: undefined,
        });

        // branch-local (participants, templates, snapshot pointers for current branch)
        expect(backend.access.refreshParticipants).toHaveBeenCalledWith(
            wsId,
            "b1",
            expect.anything(),
        );

        expect(backend.templates.refresh).toHaveBeenCalledWith(
            expect.objectContaining({
                workspaceId: wsId,
                branchId: "b1",
            }),
        );

        expect(backend.snapshots.refresh).toHaveBeenCalledWith(
            expect.objectContaining({
                workspaceId: wsId,
                branchId: "b1",
                actorId: actor.id,
            }),
        );
    });

    it("refresh.branchContext({ includeWorkspaceData:false }) refreshes only branch-local context", async () => {
        const backend: BackendMock = makeBackendMock();
        const actor: Actor = makeActor();

        let api: WorkspaceAPI | null = null;

        function Capture(): null {
            const ctx: WorkspaceAPI = useWorkspace();
            React.useEffect(() => {
                api = ctx;
            }, [ctx]);
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider
                    backend={backend}
                    actor={actor}
                    autoAutosave={false}
                    initial={{
                        branches: [makeBranch("b1", true)],
                        mainId: "b1",
                        currentBranchId: "b1",
                    }}
                >
                    <Capture />
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });

        expect(api).not.toBeNull();

        vi.clearAllMocks();

        type RefreshBranchContextFn = (
            opts?: Readonly<{
                branchId?: string;
                strict?: boolean;
                includeWorkspaceData?: boolean;
            }>,
        ) => Promise<unknown>;

        const refreshBranchContext: RefreshBranchContextFn = api!.refresh
            .branchContext as unknown as RefreshBranchContextFn;

        await act(async () => {
            await refreshBranchContext({
                branchId: "b1",
                strict: true,
                includeWorkspaceData: false,
            });
            await flushMicrotasks();
        });

        const wsId: string = backend.info.id;

        // must NOT run workspace-wide refreshers
        expect(backend.authors.refresh).not.toHaveBeenCalled();
        expect(backend.permissions.refresh).not.toHaveBeenCalled();
        expect(backend.services.refresh).not.toHaveBeenCalled();

        // must run branch-local refreshers
        expect(backend.access.refreshParticipants).toHaveBeenCalledWith(
            wsId,
            "b1",
            expect.anything(),
        );

        expect(backend.templates.refresh).toHaveBeenCalledWith(
            expect.objectContaining({
                workspaceId: wsId,
                branchId: "b1",
            }),
        );

        expect(backend.snapshots.refresh).toHaveBeenCalledWith(
            expect.objectContaining({
                workspaceId: wsId,
                branchId: "b1",
                actorId: actor.id,
            }),
        );
    });
});
