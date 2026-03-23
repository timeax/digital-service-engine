// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryWorkspaceBackend } from "./memory-backend";
import type { Actor, Branch, ServiceSnapshot } from "../backend";

class MockRequest<T> {
    public result!: T;
    public error: Error | null = null;
    public onsuccess: ((event: Event) => void) | null = null;
    public onerror: ((event: Event) => void) | null = null;

    succeed(result: T): void {
        this.result = result;
        queueMicrotask(() => this.onsuccess?.(new Event("success")));
    }

    fail(error: Error): void {
        this.error = error;
        queueMicrotask(() => this.onerror?.(new Event("error")));
    }
}

class MockOpenRequest extends MockRequest<MockDatabase> {
    public onupgradeneeded: ((event: Event) => void) | null = null;

    upgrade(): void {
        this.onupgradeneeded?.(new Event("upgradeneeded"));
    }
}

class MockObjectStoreNames {
    constructor(private readonly stores: Map<string, Map<string, unknown>>) {}

    contains(name: string): boolean {
        return this.stores.has(name);
    }
}

class MockObjectStore {
    constructor(
        private readonly records: Map<string, unknown>,
        private readonly keyPath: string,
    ) {}

    get(key: string): MockRequest<unknown> {
        const request = new MockRequest<unknown>();
        request.succeed(this.records.get(key));
        return request;
    }

    put(value: Record<string, unknown>): MockRequest<unknown> {
        const request = new MockRequest<unknown>();
        const key = String(value[this.keyPath]);
        this.records.set(key, JSON.parse(JSON.stringify(value)));
        request.succeed(value);
        return request;
    }
}

class MockTransaction {
    constructor(
        private readonly stores: Map<string, Map<string, unknown>>,
        private readonly keyPaths: Map<string, string>,
    ) {}

    objectStore(name: string): MockObjectStore {
        const records = this.stores.get(name);
        if (!records) {
            throw new Error(`Object store not found: ${name}`);
        }
        const keyPath = this.keyPaths.get(name) ?? "id";
        return new MockObjectStore(records, keyPath);
    }
}

class MockDatabase {
    public readonly stores = new Map<string, Map<string, unknown>>();
    public readonly keyPaths = new Map<string, string>();
    public readonly objectStoreNames = new MockObjectStoreNames(this.stores);

    createObjectStore(
        name: string,
        options?: Readonly<{ keyPath?: string }>,
    ): MockObjectStore {
        const records = new Map<string, unknown>();
        this.stores.set(name, records);
        this.keyPaths.set(name, options?.keyPath ?? "id");
        return new MockObjectStore(records, options?.keyPath ?? "id");
    }

    transaction(name: string, _mode: "readonly" | "readwrite"): MockTransaction {
        return new MockTransaction(this.stores, this.keyPaths);
    }
}

class MockIndexedDbFactory {
    private readonly dbs = new Map<string, MockDatabase>();

    open(name: string, _version?: number): MockOpenRequest {
        const request = new MockOpenRequest();

        queueMicrotask(() => {
            let db = this.dbs.get(name);
            const isNew = !db;
            if (!db) {
                db = new MockDatabase();
                this.dbs.set(name, db);
            }

            request.result = db;
            if (isNew) {
                request.upgrade();
            }
            request.succeed(db);
        });

        return request;
    }
}

function makeActor(): Actor {
    return { id: "actor-1", name: "Tester" };
}

function makeBranch(id = "main"): Branch {
    const now = new Date(0).toISOString();
    return {
        id,
        name: id,
        isMain: true,
        createdAt: now,
        updatedAt: now,
    };
}

function makeSnapshot(label: string): ServiceSnapshot {
    return {
        schema_version: "1",
        data: {
            nodes: [{ id: label, type: "service", position: { x: 0, y: 0 } }],
            edges: [],
            viewport: { x: 0, y: 0, zoom: 1 },
        } as unknown as ServiceSnapshot["data"],
    };
}

describe("createMemoryWorkspaceBackend persistence", () => {
    const actor = makeActor();
    const workspaceId = "ws-persist";
    const branchId = "main";
    let originalIndexedDb: typeof globalThis.indexedDB | undefined;

    beforeEach(() => {
        originalIndexedDb = globalThis.indexedDB;
        Object.defineProperty(globalThis, "indexedDB", {
            configurable: true,
            writable: true,
            value: new MockIndexedDbFactory(),
        });
    });

    it("uses seeded state when no persisted record exists yet", async () => {
        const seeded = makeSnapshot("seeded");
        const backend = createMemoryWorkspaceBackend({
            workspaceId,
            actorId: actor.id,
            seed: {
                branches: [makeBranch(branchId)],
                snapshots: {
                    [branchId]: {
                        snapshot: seeded,
                    },
                },
            },
        });

        const res = await backend.snapshots.load({
            workspaceId,
            branchId,
            actorId: actor.id,
        });

        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.value.snapshot).toEqual(seeded);
    });

    it("persists fresh seed state once and reuses it for later factory calls with the same workspace id", async () => {
        const firstSeed = makeSnapshot("first-seed");
        const secondSeed = makeSnapshot("second-seed");

        const backendA = createMemoryWorkspaceBackend({
            workspaceId: "ws-seed-bootstrap",
            actorId: actor.id,
            seed: {
                branches: [makeBranch(branchId)],
                snapshots: {
                    [branchId]: {
                        snapshot: firstSeed,
                    },
                },
            },
        });

        const firstLoad = await backendA.snapshots.load({
            workspaceId: "ws-seed-bootstrap",
            branchId,
            actorId: actor.id,
        });

        expect(firstLoad.ok).toBe(true);
        if (!firstLoad.ok) return;
        expect(firstLoad.value.snapshot).toEqual(firstSeed);

        const backendB = createMemoryWorkspaceBackend({
            workspaceId: "ws-seed-bootstrap",
            actorId: actor.id,
            seed: {
                branches: [makeBranch(branchId)],
                snapshots: {
                    [branchId]: {
                        snapshot: secondSeed,
                    },
                },
            },
        });

        const secondLoad = await backendB.snapshots.load({
            workspaceId: "ws-seed-bootstrap",
            branchId,
            actorId: actor.id,
        });

        expect(secondLoad.ok).toBe(true);
        if (!secondLoad.ok) return;
        expect(secondLoad.value.snapshot).toEqual(firstSeed);
    });

    it("persists autosaved drafts to IndexedDB across backend recreation", async () => {
        const snapshot = makeSnapshot("drafted");
        const backendA = createMemoryWorkspaceBackend({
            workspaceId,
            actorId: actor.id,
            seed: {
                branches: [makeBranch(branchId)],
            },
        });

        const autosaveRes = await backendA.snapshots.autosave({
            workspaceId,
            branchId,
            actorId: actor.id,
            snapshot,
        });

        expect(autosaveRes.ok).toBe(true);
        if (!autosaveRes.ok) return;

        const backendB = createMemoryWorkspaceBackend({
            workspaceId,
            actorId: actor.id,
            seed: {
                branches: [makeBranch(branchId)],
            },
        });

        const loadRes = await backendB.snapshots.load({
            workspaceId,
            branchId,
            actorId: actor.id,
        });

        expect(loadRes.ok).toBe(true);
        if (!loadRes.ok) return;
        expect(loadRes.value.draft?.id).toBe(autosaveRes.value.draft.id);
        expect(loadRes.value.snapshot).toEqual(snapshot);
    });

    it("persists saved commits to IndexedDB across backend recreation", async () => {
        const snapshot = makeSnapshot("saved");
        const backendA = createMemoryWorkspaceBackend({
            workspaceId: "ws-save",
            actorId: actor.id,
            seed: {
                branches: [makeBranch(branchId)],
            },
        });

        const saveRes = await backendA.snapshots.save({
            workspaceId: "ws-save",
            branchId,
            actorId: actor.id,
            snapshot,
            message: "Initial save",
        });

        expect(saveRes.ok).toBe(true);
        if (!saveRes.ok) return;

        const backendB = createMemoryWorkspaceBackend({
            workspaceId: "ws-save",
            actorId: actor.id,
            seed: {
                branches: [makeBranch(branchId)],
            },
        });

        const loadRes = await backendB.snapshots.load({
            workspaceId: "ws-save",
            branchId,
            actorId: actor.id,
        });

        expect(loadRes.ok).toBe(true);
        if (!loadRes.ok) return;
        expect(loadRes.value.head?.id).toBe(saveRes.value.commit.id);
        expect(loadRes.value.snapshot).toEqual(snapshot);
    });

    it("prefers persisted IndexedDB state over seed state for the same workspace", async () => {
        const persisted = makeSnapshot("persisted");
        const seeded = makeSnapshot("seeded");

        const backendA = createMemoryWorkspaceBackend({
            workspaceId: "ws-priority",
            actorId: actor.id,
            seed: {
                branches: [makeBranch(branchId)],
            },
        });

        const saveRes = await backendA.snapshots.save({
            workspaceId: "ws-priority",
            branchId,
            actorId: actor.id,
            snapshot: persisted,
        });

        expect(saveRes.ok).toBe(true);

        const backendB = createMemoryWorkspaceBackend({
            workspaceId: "ws-priority",
            actorId: actor.id,
            seed: {
                branches: [makeBranch(branchId)],
                snapshots: {
                    [branchId]: {
                        snapshot: seeded,
                    },
                },
            },
        });

        const loadRes = await backendB.snapshots.load({
            workspaceId: "ws-priority",
            branchId,
            actorId: actor.id,
        });

        expect(loadRes.ok).toBe(true);
        if (!loadRes.ok) return;
        expect(loadRes.value.snapshot).toEqual(persisted);
    });

    it("falls back to in-memory behavior when IndexedDB is unavailable", async () => {
        Object.defineProperty(globalThis, "indexedDB", {
            configurable: true,
            writable: true,
            value: undefined,
        });
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        const backend = createMemoryWorkspaceBackend({
            workspaceId: "ws-no-idb",
            actorId: actor.id,
            seed: {
                branches: [makeBranch(branchId)],
            },
        });

        const autosaveRes = await backend.snapshots.autosave({
            workspaceId: "ws-no-idb",
            branchId,
            actorId: actor.id,
            snapshot: makeSnapshot("memory-only"),
        });

        const saveRes = await backend.snapshots.save({
            workspaceId: "ws-no-idb",
            branchId,
            actorId: actor.id,
            snapshot: makeSnapshot("memory-only-saved"),
        });

        expect(autosaveRes.ok).toBe(true);
        expect(saveRes.ok).toBe(true);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    afterEach(() => {
        Object.defineProperty(globalThis, "indexedDB", {
            configurable: true,
            writable: true,
            value: originalIndexedDb,
        });
        vi.restoreAllMocks();
    });
});
