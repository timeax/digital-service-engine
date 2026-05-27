// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
    CanvasProvider,
    WorkspaceProvider,
    createMemoryWorkspaceBackend,
    useCanvasAPI,
    useWorkspace,
    type Actor,
    type BackendError,
    type Branch,
    type FieldTemplate,
    type ServiceSnapshot,
    type WorkspaceAPI,
} from "@/react/workspace";
import { CanvasAPI } from "@/react";

(
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

async function waitFor(
    predicate: () => boolean,
    attempts = 20,
): Promise<void> {
    for (let index = 0; index < attempts; index += 1) {
        await act(async () => {
            await flushMicrotasks();
        });

        if (predicate()) {
            return;
        }
    }

    throw new Error("Timed out waiting for condition.");
}

function makeActor(): Actor {
    return { id: "actor-1", name: "Tester" };
}

function makeBranch(id = "main", isMain = true): Branch {
    const iso = new Date(0).toISOString();
    return { id, name: id, isMain, createdAt: iso, updatedAt: iso };
}

function makeSnapshot(label: string): ServiceSnapshot {
    return {
        schema_version: "1",
        data: {
            props: {
                id: label,
                label,
                filters: [],
                fields: [],
            },
        } as ServiceSnapshot["data"],
    };
}

function makeTemplate(
    id: string,
    updatedAt: string,
    overrides?: Partial<FieldTemplate>,
): FieldTemplate {
    return {
        id,
        key: `key-${id}`,
        name: `Template ${id}`,
        kind: "text",
        definition: {},
        published: true,
        version: 1,
        createdAt: updatedAt,
        updatedAt,
        ...overrides,
    };
}

function makeBootBackend(workspaceId: string, actor: Actor) {
    return createMemoryWorkspaceBackend({
        workspaceId,
        actorId: actor.id,
        seed: {
            authors: [{ id: actor.id, name: actor.name ?? "Tester" }],
            branches: [makeBranch("main", true)],
            snapshots: {
                main: {
                    snapshot: makeSnapshot(`snapshot-${workspaceId}`),
                },
            },
            policies: { rules: [] },
        },
    });
}

function createDeferred<T = void>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

describe("WorkspaceProvider boot", () => {
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
        vi.restoreAllMocks();
    });

    it("boots from identity alone and loads the snapshot body in the provider", async () => {
        const actor = makeActor();
        const backend = makeBootBackend("ws-boot-no-initial", actor);
        const snapshotLoadSpy = vi.spyOn(backend.snapshots, "load");

        let api: WorkspaceAPI | undefined;

        function Capture(): null {
            api = useWorkspace();
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider
                    backend={backend}
                    actor={actor}
                    autoAutosave={false}
                >
                    <Capture />
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });

        await waitFor(() => Boolean(api) && api!.boot.isBooting === false);
        const workspace = api!;

        expect(snapshotLoadSpy).toHaveBeenCalledWith({
            workspaceId: backend.info.id,
            branchId: "main",
            actorId: actor.id,
            versionId: undefined,
        });
        expect(workspace.boot.isReady).toBe(true);
        expect(workspace.boot.sections.snapshotBody.status).toBe("success");
        expect(workspace.snapshot.data).toEqual(
            makeSnapshot("snapshot-ws-boot-no-initial").data,
        );
    });

    it("treats initial as seeded view only and still performs live boot loading", async () => {
        const actor = makeActor();
        const backend = makeBootBackend("ws-initial-live", actor);
        const authorsGate = createDeferred<void>();
        const originalRefresh = backend.authors.refresh.bind(backend.authors);
        const authorsRefreshSpy = vi
            .spyOn(backend.authors, "refresh")
            .mockImplementation(async (...args) => {
                await authorsGate.promise;
                return originalRefresh(...args);
            });

        let api: WorkspaceAPI | undefined;

        function Capture(): null {
            api = useWorkspace();
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider
                    backend={backend}
                    actor={actor}
                    autoAutosave={false}
                    initial={{
                        authors: [{ id: actor.id, name: "Seeded Name" }],
                        branches: [makeBranch("main", true)],
                        mainId: "main",
                        currentBranchId: "main",
                        snapshot: makeSnapshot("seeded"),
                    }}
                >
                    <Capture />
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });

        expect(api!.authors.data?.[0]?.name).toBe("Seeded Name");
        expect(api!.boot.isSeededView).toBe(true);

        authorsGate.resolve();

        await waitFor(() => Boolean(api) && api!.boot.isBooting === false);
        const workspace = api!;

        expect(authorsRefreshSpy).toHaveBeenCalled();
        expect(workspace.authors.data?.[0]?.name).toBe("Tester");
        expect(workspace.snapshot.data).toEqual(
            makeSnapshot("snapshot-ws-initial-live").data,
        );
        expect(workspace.boot.isReady).toBe(true);
        expect(workspace.boot.isLiveConfirmed).toBe(true);
        expect(workspace.boot.isSeededView).toBe(false);
    });

    it("does not run duplicate bootstrap refreshes when live mode is off", async () => {
        const actor = makeActor();
        const backend = makeBootBackend("ws-live-off-single-refresh", actor);
        const authorsRefreshSpy = vi.spyOn(backend.authors, "refresh");
        const snapshotLoadSpy = vi.spyOn(backend.snapshots, "load");

        let api: WorkspaceAPI | undefined;

        function Capture(): null {
            api = useWorkspace();
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider
                    backend={backend}
                    actor={actor}
                    autoAutosave={false}
                    live={{ mode: "off" }}
                >
                    <Capture />
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });

        await waitFor(() => Boolean(api) && api!.boot.isBooting === false);

        expect(authorsRefreshSpy).toHaveBeenCalledTimes(1);
        expect(snapshotLoadSpy).toHaveBeenCalledTimes(1);
    });

    it("hydrates canvas before CanvasProvider children mount and skips no-op layout writes", async () => {
        const actor = makeActor();
        const selectedId = "f:selected";
        const snapshot: ServiceSnapshot = {
            schema_version: "1",
            data: {
                props: {
                    id: "hydration-seed",
                    label: "hydration-seed",
                    filters: [],
                    fields: [
                        {
                            id: selectedId,
                            label: "Selected",
                            type: "text",
                        } as any,
                    ],
                },
                layout: {
                    canvas: {
                        positions: {},
                        viewport: { x: 0, y: 0, zoom: 1 },
                        selection: [selectedId],
                        highlighted: [],
                        hoverId: undefined,
                    },
                },
            } as unknown as ServiceSnapshot["data"],
        };
        const backend = createMemoryWorkspaceBackend({
            workspaceId: "ws-canvas-hydration-gate",
            actorId: actor.id,
            seed: {
                authors: [{ id: actor.id, name: actor.name ?? "Tester" }],
                branches: [makeBranch("main", true)],
                snapshots: {
                    main: {
                        snapshot,
                    },
                },
                policies: { rules: [] },
            },
        });
        const selectSpy = vi.spyOn(CanvasAPI.prototype, "select");
        const setPositionsSpy = vi.spyOn(CanvasAPI.prototype, "setPositions");
        const setViewportSpy = vi.spyOn(CanvasAPI.prototype, "setViewport");
        const clearSelectionSpy = vi.spyOn(CanvasAPI.prototype, "clearSelection");
        const setHighlightedSpy = vi.spyOn(CanvasAPI.prototype, "setHighlighted");
        const setHoverSpy = vi.spyOn(CanvasAPI.prototype, "setHover");

        let firstRenderSelection: string[] | null = null;

        function CaptureCanvas(): null {
            const api = useCanvasAPI();
            if (firstRenderSelection === null) {
                firstRenderSelection = api.getSelection().map(String);
            }
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider
                    backend={backend}
                    actor={actor}
                    autoAutosave={false}
                    live={{ mode: "off" }}
                >
                    <CanvasProvider>
                        <CaptureCanvas />
                    </CanvasProvider>
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });

        await waitFor(() => firstRenderSelection !== null);

        expect(firstRenderSelection).toEqual([selectedId]);
        expect(selectSpy).toHaveBeenCalledTimes(1);
        expect(setPositionsSpy).not.toHaveBeenCalled();
        expect(setViewportSpy).not.toHaveBeenCalled();
        expect(clearSelectionSpy).not.toHaveBeenCalled();
        expect(setHighlightedSpy).not.toHaveBeenCalled();
        expect(setHoverSpy).not.toHaveBeenCalled();
    });

    it("keeps CanvasProvider children mounted across ordinary snapshot rerenders", async () => {
        const actor = makeActor();
        const snapshot: ServiceSnapshot = {
            schema_version: "1",
            data: {
                props: {
                    id: "mount-stability-seed",
                    label: "mount-stability-seed",
                    filters: [],
                    fields: [],
                },
                meta: {
                    snapshot_id: "snapshot-mount-stability",
                },
            } as ServiceSnapshot["data"],
        };
        const backend = createMemoryWorkspaceBackend({
            workspaceId: "ws-canvas-mount-stability",
            actorId: actor.id,
            seed: {
                authors: [{ id: actor.id, name: actor.name ?? "Tester" }],
                branches: [makeBranch("main", true)],
                snapshots: {
                    main: {
                        snapshot,
                    },
                },
                policies: { rules: [] },
            },
        });

        let workspaceApi: WorkspaceAPI | undefined;
        let mountCount = 0;
        let unmountCount = 0;

        function Probe(): null {
            workspaceApi = useWorkspace();
            useCanvasAPI();
            React.useEffect(() => {
                mountCount += 1;
                return () => {
                    unmountCount += 1;
                };
            }, []);
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider
                    backend={backend}
                    actor={actor}
                    autoAutosave={false}
                    live={{ mode: "off" }}
                >
                    <CanvasProvider>
                        <Probe />
                    </CanvasProvider>
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });

        await waitFor(() => Boolean(workspaceApi) && workspaceApi!.boot.isBooting === false);
        expect(mountCount).toBe(1);
        expect(unmountCount).toBe(0);

        await act(async () => {
            workspaceApi!.snapshot.set((current) => ({
                ...current!,
                catalog: {
                    version: 1,
                    nodes: [],
                    activeNodeId: undefined,
                    selectedServiceId: "service-a",
                } as any,
            }));
            await flushMicrotasks();
        });

        expect(mountCount).toBe(1);
        expect(unmountCount).toBe(0);
    });

    it("does not retrigger hydration on local snapshot updates without identity change", async () => {
        const actor = makeActor();
        const snapshot: ServiceSnapshot = {
            schema_version: "1",
            data: {
                props: {
                    id: "identity-stable-seed",
                    label: "identity-stable-seed",
                    filters: [],
                    fields: [],
                },
                meta: {
                    snapshot_id: "snapshot-static-id",
                },
            } as ServiceSnapshot["data"],
        };
        const backend = createMemoryWorkspaceBackend({
            workspaceId: "ws-hydration-no-retrigger",
            actorId: actor.id,
            seed: {
                authors: [{ id: actor.id, name: actor.name ?? "Tester" }],
                branches: [makeBranch("main", true)],
                snapshots: {
                    main: {
                        snapshot,
                    },
                },
                policies: { rules: [] },
            },
        });
        const refreshGraphSpy = vi.spyOn(CanvasAPI.prototype, "refreshGraph");

        let workspaceApi: WorkspaceAPI | undefined;

        function Capture(): null {
            workspaceApi = useWorkspace();
            useCanvasAPI();
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider
                    backend={backend}
                    actor={actor}
                    autoAutosave={false}
                    live={{ mode: "off" }}
                >
                    <CanvasProvider>
                        <Capture />
                    </CanvasProvider>
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });

        await waitFor(() => Boolean(workspaceApi) && workspaceApi!.boot.isBooting === false);
        const baselineRefreshCalls = refreshGraphSpy.mock.calls.length;
        expect(baselineRefreshCalls).toBeGreaterThan(0);

        await act(async () => {
            workspaceApi!.snapshot.set((current) => ({
                ...current!,
                catalog: {
                    version: 1,
                    nodes: [],
                    activeNodeId: undefined,
                    selectedServiceId: "service-b",
                } as any,
                meta: {
                    ...((current?.meta ?? {}) as Record<string, unknown>),
                    snapshot_id: "snapshot-static-id",
                },
            }));
            await flushMicrotasks();
        });

        expect(refreshGraphSpy.mock.calls.length).toBe(baselineRefreshCalls);
    });

    it("rehydrates on snapshot identity change without remounting CanvasProvider children", async () => {
        const actor = makeActor();
        const snapshot: ServiceSnapshot = {
            schema_version: "1",
            data: {
                props: {
                    id: "identity-change-seed",
                    label: "identity-change-seed",
                    filters: [],
                    fields: [],
                },
                meta: {
                    snapshot_id: "snapshot-v1",
                },
            } as ServiceSnapshot["data"],
        };
        const backend = createMemoryWorkspaceBackend({
            workspaceId: "ws-hydration-identity-change",
            actorId: actor.id,
            seed: {
                authors: [{ id: actor.id, name: actor.name ?? "Tester" }],
                branches: [makeBranch("main", true)],
                snapshots: {
                    main: {
                        snapshot,
                    },
                },
                policies: { rules: [] },
            },
        });
        const refreshGraphSpy = vi.spyOn(CanvasAPI.prototype, "refreshGraph");

        let workspaceApi: WorkspaceAPI | undefined;
        let mountCount = 0;
        let unmountCount = 0;

        function Probe(): null {
            workspaceApi = useWorkspace();
            useCanvasAPI();
            React.useEffect(() => {
                mountCount += 1;
                return () => {
                    unmountCount += 1;
                };
            }, []);
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider
                    backend={backend}
                    actor={actor}
                    autoAutosave={false}
                    live={{ mode: "off" }}
                >
                    <CanvasProvider>
                        <Probe />
                    </CanvasProvider>
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });

        await waitFor(() => Boolean(workspaceApi) && workspaceApi!.boot.isBooting === false);
        const baselineRefreshCalls = refreshGraphSpy.mock.calls.length;
        expect(mountCount).toBe(1);
        expect(unmountCount).toBe(0);

        await act(async () => {
            workspaceApi!.snapshot.set((current) => ({
                ...current!,
                meta: {
                    ...((current?.meta ?? {}) as Record<string, unknown>),
                    snapshot_id: "snapshot-v2",
                },
            }));
            await flushMicrotasks();
        });

        expect(refreshGraphSpy.mock.calls.length).toBeGreaterThan(baselineRefreshCalls);
        expect(mountCount).toBe(1);
        expect(unmountCount).toBe(0);
    });

    it("tracks per-section errors and keeps comments non-blocking", async () => {
        const actor = makeActor();
        const backend = makeBootBackend("ws-comment-failure", actor);
        const commentError: BackendError = {
            code: "comment_failure",
            message: "Comment refresh failed.",
        };

        const commentSpy = vi
            .spyOn(backend.comments, "listThreads")
            .mockResolvedValue({
                ok: false,
                error: commentError,
            });

        let api: WorkspaceAPI | undefined;

        function Capture(): null {
            api = useWorkspace();
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider
                    backend={backend}
                    actor={actor}
                    autoAutosave={false}
                >
                    <Capture />
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });

        await waitFor(
            () =>
                Boolean(api) &&
                api!.boot.sections.comments.status === "error" &&
                api!.boot.isBooting === false,
        );
        const workspace = api!;

        expect(commentSpy).toHaveBeenCalled();
        expect(workspace.boot.isReady).toBe(true);
        expect(workspace.boot.hasErrors).toBe(true);
        expect(workspace.boot.hasPartialFailure).toBe(true);
        expect(workspace.boot.errorsBySection.comments).toEqual(commentError);

        commentSpy.mockResolvedValue({ ok: true, value: [] });

        await act(async () => {
            await workspace.boot.retrySection("comments");
            await flushMicrotasks();
        });

        expect(api!.boot.sections.comments.status).toBe("success");
    });

    it("treats policy failures as blocking and exposes the failed section", async () => {
        const actor = makeActor();
        const backend = makeBootBackend("ws-policy-failure", actor);
        const policyError: BackendError = {
            code: "policy_failure",
            message: "Policy refresh failed.",
        };

        vi.spyOn(backend.policies, "load").mockResolvedValue({
            ok: false,
            error: policyError,
        });

        let api: WorkspaceAPI | undefined;

        function Capture(): null {
            api = useWorkspace();
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider
                    backend={backend}
                    actor={actor}
                    autoAutosave={false}
                >
                    <Capture />
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });

        await waitFor(
            () =>
                Boolean(api) &&
                api!.boot.sections.policies.status === "error" &&
                api!.boot.isBooting === false,
        );
        const workspace = api!;

        expect(workspace.boot.isReady).toBe(false);
        expect(workspace.boot.hasErrors).toBe(true);
        expect(workspace.boot.errorsBySection.policies).toEqual(policyError);
    });

    it("refresh.branchContext without workspace data only reloads branch-local sections", async () => {
        const actor = makeActor();
        const backend = makeBootBackend("ws-branch-context", actor);

        const spyAuthorsRefresh = vi.spyOn(backend.authors, "refresh");
        const spyPermissionsRefresh = vi.spyOn(backend.permissions, "refresh");
        const spyServicesRefresh = vi.spyOn(backend.services, "refresh");
        const spyParticipantsRefresh = vi.spyOn(
            backend.access,
            "refreshParticipants",
        );
        const spyTemplatesRefresh = vi.spyOn(backend.templates, "refresh");
        const spySnapshotsRefresh = vi.spyOn(backend.snapshots, "refresh");
        const spySnapshotsLoad = vi.spyOn(backend.snapshots, "load");
        const spyPoliciesLoad = vi.spyOn(backend.policies, "load");
        const spyCommentsRefresh = vi.spyOn(backend.comments, "listThreads");

        let api: WorkspaceAPI | undefined;

        function Capture(): null {
            api = useWorkspace();
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider
                    backend={backend}
                    actor={actor}
                    autoAutosave={false}
                >
                    <Capture />
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });

        await waitFor(() => Boolean(api) && api!.boot.isBooting === false);
        const workspace = api!;
        vi.clearAllMocks();

        await act(async () => {
            await workspace.refresh.branchContext({
                branchId: "main",
                strict: true,
                includeWorkspaceData: false,
            });
            await flushMicrotasks();
        });

        expect(spyAuthorsRefresh).not.toHaveBeenCalled();
        expect(spyPermissionsRefresh).not.toHaveBeenCalled();
        expect(spyServicesRefresh).not.toHaveBeenCalled();
        expect(spyParticipantsRefresh).toHaveBeenCalledWith({
            workspaceId: backend.info.id,
            branchId: "main",
            since: expect.any(Number),
        });
        expect(spyTemplatesRefresh).toHaveBeenCalledWith({
            workspaceId: backend.info.id,
            branchId: "main",
            since: expect.any(Number),
        });
        expect(spySnapshotsRefresh).toHaveBeenCalledWith({
            workspaceId: backend.info.id,
            branchId: "main",
            actorId: actor.id,
            since: undefined,
        });
        expect(spySnapshotsLoad).toHaveBeenCalledWith({
            workspaceId: backend.info.id,
            branchId: "main",
            actorId: actor.id,
            versionId: undefined,
        });
        expect(spyPoliciesLoad).toHaveBeenCalledWith({
            workspaceId: backend.info.id,
            branchId: "main",
            actorId: actor.id,
            since: undefined,
        });
        expect(spyCommentsRefresh).toHaveBeenCalledWith({
            workspaceId: backend.info.id,
            actorId: actor.id,
            branchId: "main",
        });
    });

    it("refresh.branchContext with workspace data passes explicit branch context to branch-aware workspace loadables", async () => {
        const actor = makeActor();
        const backend = makeBootBackend("ws-branch-context-with-workspace", actor);
        let api: WorkspaceAPI | undefined;

        function Capture(): null {
            api = useWorkspace();
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider backend={backend} actor={actor} autoAutosave={false}>
                    <Capture />
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });
        await waitFor(() => Boolean(api) && api!.boot.isBooting === false);
        vi.clearAllMocks();

        const spyPermissionsRefresh = vi.spyOn(backend.permissions, "refresh");
        const spyServicesRefresh = vi.spyOn(backend.services, "refresh");
        const spyPoliciesLoad = vi.spyOn(backend.policies, "load");
        const spyTemplatesRefresh = vi.spyOn(backend.templates, "refresh");
        const spyParticipantsRefresh = vi.spyOn(
            backend.access,
            "refreshParticipants",
        );

        await act(async () => {
            await api!.refresh.branchContext({
                branchId: "main",
                strict: true,
                includeWorkspaceData: true,
            });
            await flushMicrotasks();
        });

        expect(spyPermissionsRefresh).toHaveBeenCalledWith({
            workspaceId: backend.info.id,
            actorId: actor.id,
            branchId: "main",
            since: undefined,
        });
        expect(spyServicesRefresh).toHaveBeenCalledWith({
            workspaceId: backend.info.id,
            branchId: "main",
            since: expect.any(Number),
        });
        expect(spyPoliciesLoad).toHaveBeenCalledWith({
            workspaceId: backend.info.id,
            actorId: actor.id,
            branchId: "main",
            since: undefined,
        });
        expect(spyTemplatesRefresh).toHaveBeenCalledWith({
            workspaceId: backend.info.id,
            branchId: "main",
            since: expect.any(Number),
        });
        expect(spyParticipantsRefresh).toHaveBeenCalledWith({
            workspaceId: backend.info.id,
            branchId: "main",
            since: expect.any(Number),
        });
    });

    it("clears stale snapshot immediately when switching to an uncached branch", async () => {
        const actor = makeActor();
        const workspaceId = `ws-branch-switch-${Date.now()}-${Math.floor(
            Math.random() * 10000,
        )}`;

        const backend = createMemoryWorkspaceBackend({
            workspaceId,
            actorId: actor.id,
            seed: {
                authors: [{ id: actor.id, name: actor.name ?? "Tester" }],
                branches: [
                    makeBranch("main", true),
                    makeBranch("experiment", false),
                ],
                snapshots: {
                    main: {
                        snapshot: makeSnapshot("main-live"),
                    },
                    experiment: {
                        snapshot: makeSnapshot("experiment-live"),
                    },
                },
                policies: { rules: [] },
            },
        });

        const experimentGate = createDeferred<void>();
        const originalLoad = backend.snapshots.load.bind(backend.snapshots);
        vi.spyOn(backend.snapshots, "load").mockImplementation(async (args) => {
            if (args.branchId === "experiment") {
                await experimentGate.promise;
            }
            return originalLoad(args);
        });

        let api: WorkspaceAPI | undefined;

        function Capture(): null {
            api = useWorkspace();
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider
                    backend={backend}
                    actor={actor}
                    autoAutosave={false}
                >
                    <Capture />
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });

        await waitFor(() => Boolean(api) && api!.boot.isBooting === false);
        expect(api!.branches.currentId).toBe("main");
        expect((api!.snapshot.data as any)?.props?.id).toBe("main-live");

        await act(async () => {
            api!.setCurrentBranch("experiment");
            await flushMicrotasks();
        });

        expect(api!.branches.currentId).toBe("experiment");
        expect(api!.snapshot.data).toBeUndefined();
        expect(api!.snapshot.schemaVersion).toBeUndefined();

        experimentGate.resolve();

        await waitFor(
            () => (api!.snapshot.data as any)?.props?.id === "experiment-live",
        );
        expect(api!.snapshot.schemaVersion).toBe("1");
    });

    it("treats malformed loaded snapshot payload as empty/loading-safe", async () => {
        const actor = makeActor();
        const workspaceId = `ws-malformed-snapshot-${Date.now()}-${Math.floor(
            Math.random() * 10000,
        )}`;

        const backend = createMemoryWorkspaceBackend({
            workspaceId,
            actorId: actor.id,
            seed: {
                authors: [{ id: actor.id, name: actor.name ?? "Tester" }],
                branches: [
                    makeBranch("main", true),
                    makeBranch("malformed", false),
                ],
                snapshots: {
                    main: {
                        snapshot: makeSnapshot("main-live"),
                    },
                    malformed: {
                        snapshot: makeSnapshot("malformed-live"),
                    },
                },
                policies: { rules: [] },
            },
        });

        const originalLoad = backend.snapshots.load.bind(backend.snapshots);
        vi.spyOn(backend.snapshots, "load").mockImplementation(async (args) => {
            if (args.branchId === "malformed") {
                return {
                    ok: true,
                    value: {
                        head: undefined,
                        draft: undefined,
                        snapshot: {
                            schema_version: "1",
                            data: {} as ServiceSnapshot["data"],
                        },
                    },
                };
            }
            return originalLoad(args);
        });

        let api: WorkspaceAPI | undefined;

        function Capture(): null {
            api = useWorkspace();
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider
                    backend={backend}
                    actor={actor}
                    autoAutosave={false}
                >
                    <Capture />
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });

        await waitFor(() => Boolean(api) && api!.boot.isBooting === false);

        await act(async () => {
            api!.setCurrentBranch("malformed");
            await flushMicrotasks();
        });

        await waitFor(
            () =>
                api!.branches.currentId === "malformed" &&
                api!.boot.sections.snapshotBody.status === "success",
        );

        expect(api!.snapshot.data).toBeUndefined();
        expect(api!.snapshot.schemaVersion).toBeUndefined();
        expect(api!.snapshot.state).toBe("clean");
    });

    it("forwards workspace policies and workspace-level rate/fallback config into builder options", async () => {
        const actor = makeActor();
        const backend = createMemoryWorkspaceBackend({
            workspaceId: "ws-builder-governance-forwarding",
            actorId: actor.id,
            seed: {
                authors: [{ id: actor.id, name: actor.name ?? "Tester" }],
                branches: [makeBranch("main", true)],
                snapshots: {
                    main: {
                        snapshot: makeSnapshot("governance-forwarding"),
                    },
                },
                policiesByBranch: {
                    main: [
                        {
                            id: "no_mix_platform",
                            scope: "visible_group",
                            subject: "services",
                            op: "no_mix",
                            projection: "service.platform_id",
                            severity: "error",
                        },
                    ],
                },
            },
        });

        let capturedOptions: any;

        function CaptureCanvas(): null {
            const api = useCanvasAPI();
            capturedOptions = api.builder.getOptions();
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider
                    backend={backend}
                    actor={actor}
                    autoAutosave={false}
                    live={{ mode: "off" }}
                >
                    <CanvasProvider
                        ratePolicy={{ kind: "eq_primary" }}
                        fallbackSettings={{
                            mode: "dev",
                            selectionStrategy: "cheapest",
                        }}
                    >
                        <CaptureCanvas />
                    </CanvasProvider>
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });

        await waitFor(() => Boolean(capturedOptions));

        expect(capturedOptions.ratePolicy).toEqual({ kind: "eq_primary" });
        expect(capturedOptions.fallbackSettings).toEqual({
            mode: "dev",
            selectionStrategy: "cheapest",
        });
        expect(Array.isArray(capturedOptions.policies)).toBe(true);
        expect(capturedOptions.policies.length).toBeGreaterThan(0);
        expect(capturedOptions.policies[0].id).toBe("no_mix_platform");
    });

    it("reactively updates builder rate/fallback options from workspace props without remounting canvas children", async () => {
        const actor = makeActor();
        const backend = makeBootBackend("ws-builder-governance-reactive", actor);
        const policiesLoadSpy = vi.spyOn(backend.policies, "load");

        let setRatePolicy:
            | ((value: { kind: "eq_primary" } | { kind: "within_pct"; pct: number }) => void)
            | undefined;
        let setFallbackMode: ((value: "strict" | "dev") => void) | undefined;
        let latestOptions: any;
        let capturedApi: CanvasAPI | undefined;
        let mountCount = 0;
        let unmountCount = 0;

        function RuntimeHarness(): React.JSX.Element {
            const [ratePolicy, updateRatePolicy] = React.useState<
                { kind: "eq_primary" } | { kind: "within_pct"; pct: number }
            >({ kind: "eq_primary" });
            const [fallbackMode, updateFallbackMode] = React.useState<
                "strict" | "dev"
            >("strict");

            setRatePolicy = updateRatePolicy;
            setFallbackMode = updateFallbackMode;

            return (
                <WorkspaceProvider
                    backend={backend}
                    actor={actor}
                    autoAutosave={false}
                    live={{ mode: "off" }}
                >
                    <CanvasProvider
                        ratePolicy={ratePolicy}
                        fallbackSettings={{ mode: fallbackMode }}
                    >
                        <CaptureBuilderOptions />
                    </CanvasProvider>
                </WorkspaceProvider>
            );
        }

        function CaptureBuilderOptions(): null {
            const api = useCanvasAPI();
            capturedApi = api;
            React.useEffect(() => {
                mountCount += 1;
                return () => {
                    unmountCount += 1;
                };
            }, []);
            latestOptions = api.builder.getOptions();
            return null;
        }

        await act(async () => {
            root?.render(<RuntimeHarness />);
            await flushMicrotasks();
        });

        await waitFor(() => Boolean(latestOptions));
        expect(latestOptions.ratePolicy).toEqual({ kind: "eq_primary" });
        expect(latestOptions.fallbackSettings?.mode).toBe("strict");
        const baselinePolicyLoads = policiesLoadSpy.mock.calls.length;
        expect(mountCount).toBe(1);
        expect(unmountCount).toBe(0);

        await act(async () => {
            setRatePolicy?.({ kind: "within_pct", pct: 25 });
            setFallbackMode?.("dev");
            await flushMicrotasks();
        });

        await waitFor(
            () =>
                capturedApi?.builder.getOptions().ratePolicy?.kind ===
                    "within_pct" &&
                capturedApi?.builder.getOptions().fallbackSettings?.mode ===
                    "dev",
        );

        latestOptions = capturedApi?.builder.getOptions();
        expect(mountCount).toBe(1);
        expect(unmountCount).toBe(0);
        expect(policiesLoadSpy.mock.calls.length).toBe(baselinePolicyLoads);
    });

    it("full refresh without since replaces templates", async () => {
        const actor = makeActor();
        const backend = createMemoryWorkspaceBackend({
            workspaceId: "ws-templates-full-refresh",
            actorId: actor.id,
            seed: {
                authors: [{ id: actor.id, name: actor.name ?? "Tester" }],
                branches: [makeBranch("main", true)],
                snapshots: { main: { snapshot: makeSnapshot("templates-1") } },
                templates: [makeTemplate("t1", "2026-01-01T00:00:00.000Z")],
                policies: { rules: [] },
            },
        });

        let api: WorkspaceAPI | undefined;
        function Capture(): null {
            api = useWorkspace();
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider backend={backend} actor={actor} autoAutosave={false}>
                    <Capture />
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });
        await waitFor(() => Boolean(api) && api!.boot.isBooting === false);

        vi.spyOn(backend.templates, "refresh").mockResolvedValue({
            ok: true,
            value: [makeTemplate("t2", "2026-01-02T00:00:00.000Z")],
        });

        await act(async () => {
            api!.invalidate(["templates"]);
            await flushMicrotasks();
        });
        await act(async () => {
            await api!.refresh.templates({ branchId: "main" });
            await flushMicrotasks();
        });

        expect(api!.templates.data?.map((t) => t.id)).toEqual(["t2"]);
    });

    it("delta refresh with one updated template merges into existing list", async () => {
        const actor = makeActor();
        const keep = makeTemplate("keep", "2026-01-01T00:00:00.000Z");
        const updateOld = makeTemplate("update", "2026-07-02T00:00:00.000Z");
        const backend = createMemoryWorkspaceBackend({
            workspaceId: "ws-templates-delta-refresh",
            actorId: actor.id,
            seed: {
                authors: [{ id: actor.id, name: actor.name ?? "Tester" }],
                branches: [makeBranch("main", true)],
                snapshots: { main: { snapshot: makeSnapshot("templates-2") } },
                templates: [keep, updateOld],
                policies: { rules: [] },
            },
        });

        let api: WorkspaceAPI | undefined;
        function Capture(): null {
            api = useWorkspace();
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider backend={backend} actor={actor} autoAutosave={false}>
                    <Capture />
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });
        await waitFor(() => Boolean(api) && api!.boot.isBooting === false);

        const refreshSpy = vi.spyOn(backend.templates, "refresh");

        refreshSpy.mockResolvedValueOnce({
            ok: true,
            value: [
                makeTemplate("update", "2026-07-04T00:00:00.000Z", {
                    name: "Template update newer",
                }),
            ],
        });
        await act(async () => {
            await api!.refresh.templates({
                branchId: "main",
                since: "2026-06-01T00:00:00.000Z",
            });
            await flushMicrotasks();
        });
        expect(
            api!.templates.data?.find((template) => template.id === "update")
                ?.name,
        ).toBe("Template update newer");
        expect(api!.templates.data?.some((template) => template.id === "keep")).toBe(
            true,
        );
    });

    it("delta refresh with empty response does not clear unchanged templates", async () => {
        const actor = makeActor();
        const backend = createMemoryWorkspaceBackend({
            workspaceId: "ws-templates-delta-empty",
            actorId: actor.id,
            seed: {
                authors: [{ id: actor.id, name: actor.name ?? "Tester" }],
                branches: [makeBranch("main", true)],
                snapshots: { main: { snapshot: makeSnapshot("templates-2b") } },
                templates: [
                    makeTemplate("keep-a", "2026-01-01T00:00:00.000Z"),
                    makeTemplate("keep-b", "2026-01-02T00:00:00.000Z"),
                ],
                policies: { rules: [] },
            },
        });

        let api: WorkspaceAPI | undefined;
        function Capture(): null {
            api = useWorkspace();
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider backend={backend} actor={actor} autoAutosave={false}>
                    <Capture />
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });
        await waitFor(() => Boolean(api) && api!.boot.isBooting === false);

        vi.spyOn(backend.templates, "refresh").mockResolvedValue({
            ok: true,
            value: [],
        });

        await act(async () => {
            await api!.refresh.templates({
                branchId: "main",
                since: "2026-06-02T00:00:00.000Z",
            });
            await flushMicrotasks();
        });
        expect(api!.templates.data?.map((t) => t.id).sort()).toEqual([
            "keep-a",
            "keep-b",
        ]);
    });

    it("delta refresh does not infer deletion from missing items in normal refresh flow", async () => {
        const actor = makeActor();
        const backend = createMemoryWorkspaceBackend({
            workspaceId: "ws-templates-delta-delete",
            actorId: actor.id,
            seed: {
                authors: [{ id: actor.id, name: actor.name ?? "Tester" }],
                branches: [makeBranch("main", true)],
                snapshots: { main: { snapshot: makeSnapshot("templates-2c") } },
                templates: [
                    makeTemplate("keep", "2026-01-01T00:00:00.000Z"),
                    makeTemplate("delete-me", "2026-07-03T00:00:00.000Z"),
                ],
                policies: { rules: [] },
            },
        });

        let api: WorkspaceAPI | undefined;
        function Capture(): null {
            api = useWorkspace();
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider backend={backend} actor={actor} autoAutosave={false}>
                    <Capture />
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });
        await waitFor(() => Boolean(api) && api!.boot.isBooting === false);

        vi.spyOn(backend.templates, "refresh").mockResolvedValue({
            ok: true,
            value: [],
        });

        await act(async () => {
            await api!.refresh.templates({
                branchId: "main",
                since: "2026-07-02T12:00:00.000Z",
            });
            await flushMicrotasks();
        });
        expect(api!.templates.data?.some((template) => template.id === "delete-me")).toBe(
            true,
        );
    });

    it("delta merge keeps newer local template over older incoming", async () => {
        const actor = makeActor();
        const backend = createMemoryWorkspaceBackend({
            workspaceId: "ws-templates-newer-local",
            actorId: actor.id,
            seed: {
                authors: [{ id: actor.id, name: actor.name ?? "Tester" }],
                branches: [makeBranch("main", true)],
                snapshots: { main: { snapshot: makeSnapshot("templates-3") } },
                templates: [
                    makeTemplate("same", "2026-01-05T00:00:00.000Z", {
                        name: "Local New",
                    }),
                ],
                policies: { rules: [] },
            },
        });

        let api: WorkspaceAPI | undefined;
        function Capture(): null {
            api = useWorkspace();
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider backend={backend} actor={actor} autoAutosave={false}>
                    <Capture />
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });
        await waitFor(() => Boolean(api) && api!.boot.isBooting === false);

        vi.spyOn(backend.templates, "refresh").mockResolvedValue({
            ok: true,
            value: [
                makeTemplate("same", "2026-01-04T00:00:00.000Z", {
                    name: "Incoming Old",
                }),
            ],
        });

        await act(async () => {
            await api!.refresh.templates({
                branchId: "main",
                since: "2026-06-01T00:00:00.000Z",
            });
            await flushMicrotasks();
        });

        expect(
            api!.templates.data?.find((template) => template.id === "same")
                ?.name,
        ).toBe("Local New");
    });

    it("delta merge keeps newer incoming template over older local", async () => {
        const actor = makeActor();
        const backend = createMemoryWorkspaceBackend({
            workspaceId: "ws-templates-newer-incoming",
            actorId: actor.id,
            seed: {
                authors: [{ id: actor.id, name: actor.name ?? "Tester" }],
                branches: [makeBranch("main", true)],
                snapshots: { main: { snapshot: makeSnapshot("templates-4") } },
                templates: [
                    makeTemplate("same", "2026-01-04T00:00:00.000Z", {
                        name: "Local Old",
                    }),
                ],
                policies: { rules: [] },
            },
        });

        let api: WorkspaceAPI | undefined;
        function Capture(): null {
            api = useWorkspace();
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider backend={backend} actor={actor} autoAutosave={false}>
                    <Capture />
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });
        await waitFor(() => Boolean(api) && api!.boot.isBooting === false);

        vi.spyOn(backend.templates, "refresh").mockResolvedValue({
            ok: true,
            value: [
                makeTemplate("same", "2026-01-06T00:00:00.000Z", {
                    name: "Incoming New",
                }),
            ],
        });

        await act(async () => {
            await api!.refresh.templates({
                branchId: "main",
                since: "2026-06-01T00:00:00.000Z",
            });
            await flushMicrotasks();
        });

        expect(
            api!.templates.data?.find((template) => template.id === "same")
                ?.name,
        ).toBe("Incoming New");
    });

    it("treats stale requested since older than slice updatedAt as full replace", async () => {
        const actor = makeActor();
        const backend = createMemoryWorkspaceBackend({
            workspaceId: "ws-templates-stale-since",
            actorId: actor.id,
            seed: {
                authors: [{ id: actor.id, name: actor.name ?? "Tester" }],
                branches: [makeBranch("main", true)],
                snapshots: { main: { snapshot: makeSnapshot("templates-5") } },
                templates: [makeTemplate("keep", "2026-01-03T00:00:00.000Z")],
                policies: { rules: [] },
            },
        });

        let api: WorkspaceAPI | undefined;
        function Capture(): null {
            api = useWorkspace();
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider backend={backend} actor={actor} autoAutosave={false}>
                    <Capture />
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });
        await waitFor(() => Boolean(api) && api!.boot.isBooting === false);

        vi.spyOn(backend.templates, "refresh").mockResolvedValue({
            ok: true,
            value: [makeTemplate("new", "2026-01-07T00:00:00.000Z")],
        });

        await act(async () => {
            await api!.refresh.templates({
                branchId: "main",
                since: "2000-01-01T00:00:00.000Z",
            });
            await flushMicrotasks();
        });

        expect(api!.templates.data?.map((t) => t.id)).toEqual(["new"]);
    });

    it("deleteTemplate keeps remaining templates when refresh returns empty delta", async () => {
        const actor = makeActor();
        const backend = createMemoryWorkspaceBackend({
            workspaceId: "ws-templates-delete-empty-refresh",
            actorId: actor.id,
            seed: {
                authors: [{ id: actor.id, name: actor.name ?? "Tester" }],
                branches: [makeBranch("main", true)],
                snapshots: { main: { snapshot: makeSnapshot("templates-6") } },
                templates: [
                    makeTemplate("t1", "2026-01-01T00:00:00.000Z"),
                    makeTemplate("t2", "2026-01-02T00:00:00.000Z"),
                    makeTemplate("t3", "2026-01-03T00:00:00.000Z"),
                    makeTemplate("t4", "2026-01-04T00:00:00.000Z"),
                ],
                policies: { rules: [] },
            },
        });

        let api: WorkspaceAPI | undefined;
        function Capture(): null {
            api = useWorkspace();
            return null;
        }

        await act(async () => {
            root?.render(
                <WorkspaceProvider
                    backend={backend}
                    actor={actor}
                    autoAutosave={false}
                >
                    <Capture />
                </WorkspaceProvider>,
            );
            await flushMicrotasks();
        });
        await waitFor(() => Boolean(api) && api!.boot.isBooting === false);

        vi.spyOn(backend.templates, "refresh").mockResolvedValue({
            ok: true,
            value: [],
        });

        await act(async () => {
            await api!.deleteTemplate("t2");
            await flushMicrotasks();
        });

        const ids = (api!.templates.data ?? []).map((template) => template.id);
        expect(ids).toHaveLength(3);
        expect(ids).not.toContain("t2");
        expect(ids.sort()).toEqual(["t1", "t3", "t4"]);
    });
});
