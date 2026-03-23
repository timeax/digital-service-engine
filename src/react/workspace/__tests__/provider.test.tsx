// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
    WorkspaceProvider,
    createMemoryWorkspaceBackend,
    useWorkspace,
    type Actor,
    type BackendError,
    type Branch,
    type ServiceSnapshot,
    type WorkspaceAPI,
} from "@/react/workspace";

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
        expect(spyParticipantsRefresh).toHaveBeenCalled();
        expect(spyTemplatesRefresh).toHaveBeenCalled();
        expect(spySnapshotsRefresh).toHaveBeenCalled();
        expect(spySnapshotsLoad).toHaveBeenCalled();
        expect(spyPoliciesLoad).toHaveBeenCalled();
        expect(spyCommentsRefresh).toHaveBeenCalled();
    });
});
