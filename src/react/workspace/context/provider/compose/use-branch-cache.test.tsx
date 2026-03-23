// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { SnapshotSlice, Loadable } from "../types";
import type { BranchParticipant, FieldTemplate } from "../../backend";
import { useBranchCache, type BranchCacheApi } from "./use-branch-cache";

(
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class FakeCacheStore {
    private ready = true;
    private readonly map = new Map<string, unknown>();
    private readonly readySubscribers = new Set<() => void>();

    setReady(ready: boolean): void {
        this.ready = ready;
    }

    triggerReady(): void {
        this.ready = true;
        for (const fn of Array.from(this.readySubscribers)) {
            fn();
        }
    }

    isReady(): boolean {
        return this.ready;
    }

    subscribeReady(fn: () => void): () => void {
        this.readySubscribers.add(fn);
        return () => {
            this.readySubscribers.delete(fn);
        };
    }

    get<T>(key: string): T | undefined {
        return this.map.get(key) as T | undefined;
    }

    set<T>(key: string, value: T): void {
        this.map.set(key, value);
    }

    clear(prefix: string): void {
        for (const key of Array.from(this.map.keys())) {
            if (key.startsWith(prefix)) {
                this.map.delete(key);
            }
        }
    }
}

let fakeCache: FakeCacheStore;

vi.mock("@timeax/cache-store", () => ({
    createCache: vi.fn(() => fakeCache),
    createIndexedDBDriver: vi.fn(() => ({})),
}));

function cacheKey(workspaceId: string, branchId: string): string {
    return `ws:${workspaceId}:branch:${branchId}`;
}

function createValidSnapshot(id: string): SnapshotSlice {
    return {
        schemaVersion: "1",
        data: {
            props: {
                id,
                label: id,
                filters: [],
                fields: [],
            },
        } as SnapshotSlice["data"],
        head: undefined,
        draft: undefined,
        state: "clean",
        saving: false,
        dirty: false,
    };
}

function createInvalidSnapshot(): SnapshotSlice {
    return {
        schemaVersion: "1",
        data: {} as SnapshotSlice["data"],
        head: undefined,
        draft: undefined,
        state: "clean",
        saving: false,
        dirty: false,
    };
}

function createClearedSnapshot(): SnapshotSlice {
    return {
        schemaVersion: undefined,
        data: undefined,
        head: undefined,
        draft: undefined,
        state: "clean",
        saving: false,
        dirty: false,
    };
}

function createLoadable<T>(data: T): Loadable<T> {
    return {
        data,
        loading: false,
    };
}

function createBranchCacheEntry(snapshot: SnapshotSlice) {
    return {
        templates: createLoadable<readonly FieldTemplate[]>([]),
        participants: createLoadable<readonly BranchParticipant[]>([]),
        snapshot,
    };
}

describe("useBranchCache", () => {
    let root: Root | null;
    let container: HTMLDivElement;
    let api: BranchCacheApi | undefined;

    beforeEach(() => {
        fakeCache = new FakeCacheStore();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        api = undefined;
    });

    afterEach(() => {
        if (root) {
            act(() => root?.unmount());
            root = null;
        }
        container.remove();
        vi.restoreAllMocks();
    });

    function mount(workspaceId: string): BranchCacheApi {
        function Harness(): null {
            api = useBranchCache(workspaceId);
            return null;
        }

        act(() => {
            root?.render(<Harness />);
        });

        if (!api) {
            throw new Error("Hook did not mount");
        }

        return api;
    }

    it("treats invalid cached snapshot shape as cache miss and keeps snapshot cleared", () => {
        const workspaceId = "ws-invalid-cache";
        const branchCache = mount(workspaceId);

        let currentBranchId = "main";
        let currentSnapshot = createValidSnapshot("main-live");
        const resetSnapshot = vi.fn(() => {
            currentSnapshot = createClearedSnapshot();
        });

        fakeCache.set(
            cacheKey(workspaceId, "experiment"),
            createBranchCacheEntry(createInvalidSnapshot()),
        );

        branchCache.switchBranch({
            workspaceId,
            nextId: "experiment",
            prevId: "main",
            templates: createLoadable<readonly FieldTemplate[]>([]),
            participants: createLoadable<readonly BranchParticipant[]>([]),
            snapshot: createValidSnapshot("main-live"),
            setTemplates: vi.fn(),
            setParticipants: vi.fn(),
            setSnapshot: (next) => {
                currentSnapshot =
                    typeof next === "function"
                        ? next(currentSnapshot)
                        : next;
            },
            resetTemplates: vi.fn(),
            resetParticipants: vi.fn(),
            resetSnapshot,
            setCurrentBranchId: (id) => {
                currentBranchId = id;
            },
            getCurrentBranchId: () => currentBranchId,
            getCurrentSnapshot: () => currentSnapshot,
        });

        expect(currentBranchId).toBe("experiment");
        expect(resetSnapshot).toHaveBeenCalledTimes(1);
        expect(currentSnapshot.data).toBeUndefined();
        expect(currentSnapshot.schemaVersion).toBeUndefined();
    });

    it("does not overwrite an already-loaded valid snapshot when deferred cache hydration completes", () => {
        const workspaceId = "ws-deferred-no-overwrite";
        fakeCache.setReady(false);
        const branchCache = mount(workspaceId);

        let currentBranchId = "main";
        let currentSnapshot = createValidSnapshot("main-live");
        const setSnapshot: React.Dispatch<React.SetStateAction<SnapshotSlice>> =
            (next) => {
                currentSnapshot =
                    typeof next === "function"
                        ? next(currentSnapshot)
                        : next;
            };

        branchCache.switchBranch({
            workspaceId,
            nextId: "experiment",
            prevId: "main",
            templates: createLoadable<readonly FieldTemplate[]>([]),
            participants: createLoadable<readonly BranchParticipant[]>([]),
            snapshot: createValidSnapshot("main-live"),
            setTemplates: vi.fn(),
            setParticipants: vi.fn(),
            setSnapshot,
            resetTemplates: vi.fn(),
            resetParticipants: vi.fn(),
            resetSnapshot: () => {
                currentSnapshot = createClearedSnapshot();
            },
            setCurrentBranchId: (id) => {
                currentBranchId = id;
            },
            getCurrentBranchId: () => currentBranchId,
            getCurrentSnapshot: () => currentSnapshot,
        });

        // Simulate async branch snapshot load completing before cache hydration.
        setSnapshot(createValidSnapshot("experiment-fresh"));

        fakeCache.set(
            cacheKey(workspaceId, "experiment"),
            createBranchCacheEntry(createValidSnapshot("experiment-stale")),
        );

        act(() => {
            fakeCache.triggerReady();
        });

        expect((currentSnapshot.data as any)?.props?.id).toBe(
            "experiment-fresh",
        );
    });

    it("ignores deferred cache apply when the target branch is no longer active", () => {
        const workspaceId = "ws-deferred-inactive";
        fakeCache.setReady(false);
        const branchCache = mount(workspaceId);

        let currentBranchId = "main";
        let currentSnapshot = createValidSnapshot("main-live");

        branchCache.switchBranch({
            workspaceId,
            nextId: "experiment",
            prevId: "main",
            templates: createLoadable<readonly FieldTemplate[]>([]),
            participants: createLoadable<readonly BranchParticipant[]>([]),
            snapshot: createValidSnapshot("main-live"),
            setTemplates: vi.fn(),
            setParticipants: vi.fn(),
            setSnapshot: (next) => {
                currentSnapshot =
                    typeof next === "function"
                        ? next(currentSnapshot)
                        : next;
            },
            resetTemplates: vi.fn(),
            resetParticipants: vi.fn(),
            resetSnapshot: () => {
                currentSnapshot = createClearedSnapshot();
            },
            setCurrentBranchId: (id) => {
                currentBranchId = id;
            },
            getCurrentBranchId: () => currentBranchId,
            getCurrentSnapshot: () => currentSnapshot,
        });

        // Branch changed again before hydration completed.
        currentBranchId = "main";

        fakeCache.set(
            cacheKey(workspaceId, "experiment"),
            createBranchCacheEntry(createValidSnapshot("experiment-cached")),
        );

        act(() => {
            fakeCache.triggerReady();
        });

        expect((currentSnapshot.data as any)?.props?.id).not.toBe(
            "experiment-cached",
        );
    });
});
