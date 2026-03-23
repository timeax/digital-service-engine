import type {
    Author,
    Branch,
    BranchParticipant,
    Commit,
    Draft,
    FieldTemplate,
    PermissionsMap,
    ServiceSnapshot,
    ServicesInput,
    WorkspaceInfo,
} from "../backend";
import type {
    BranchSnapshotState,
    CommentsBranchState,
    MemoryWorkspaceStore,
    PolicyState,
} from "./store";
import { newBranchSnapshotState, newCommentsBranchState } from "./store";
import type { CommentThread, ThreadId } from "@/schema/comments";

interface SerializedBranchSnapshotState {
    readonly head?: Commit;
    readonly headSnapshot?: ServiceSnapshot;
    readonly drafts: ReadonlyArray<
        readonly [string, { draft: Draft; snapshot: ServiceSnapshot }]
    >;
    readonly commits: ReadonlyArray<
        readonly [string, { commit: Commit; snapshot: ServiceSnapshot }]
    >;
}

interface SerializedCommentsBranchState {
    readonly threads: ReadonlyArray<readonly [ThreadId, CommentThread]>;
}

export interface PersistedMemoryWorkspaceStore {
    readonly version: 1;
    readonly info: WorkspaceInfo;
    readonly authors: ReadonlyArray<readonly [string, Author]>;
    readonly permissionsByActor: ReadonlyArray<
        readonly [string, PermissionsMap]
    >;
    readonly branches: ReadonlyArray<readonly [string, Branch]>;
    readonly participantsByBranch: ReadonlyArray<
        readonly [string, readonly BranchParticipant[]]
    >;
    readonly services: ServicesInput | null;
    readonly templates: ReadonlyArray<readonly [string, FieldTemplate]>;
    readonly snapshotsByBranch: ReadonlyArray<
        readonly [string, SerializedBranchSnapshotState]
    >;
    readonly commentsByBranch: ReadonlyArray<
        readonly [string, SerializedCommentsBranchState]
    >;
    readonly policies: PolicyState | null;
    readonly policiesByBranch: ReadonlyArray<readonly [string, PolicyState]>;
}

interface PersistedWorkspaceRecord {
    readonly workspaceId: string;
    readonly store: PersistedMemoryWorkspaceStore;
}

export interface MemoryPersistence {
    load(workspaceId: string): Promise<PersistedMemoryWorkspaceStore | null>;
    save(workspaceId: string, store: MemoryWorkspaceStore): Promise<void>;
}

const DB_NAME = "digital-service-ui-builder-memory";
const DB_VERSION = 1;
const STORE_NAME = "workspace-backends";

function cloneMapEntries<K, V>(map: ReadonlyMap<K, V>): Array<readonly [K, V]> {
    return Array.from(map.entries());
}

function serializeBranchSnapshotState(
    state: BranchSnapshotState,
): SerializedBranchSnapshotState {
    return {
        head: state.head,
        headSnapshot: state.headSnapshot,
        drafts: cloneMapEntries(state.drafts),
        commits: cloneMapEntries(state.commits),
    };
}

function serializeCommentsBranchState(
    state: CommentsBranchState,
): SerializedCommentsBranchState {
    return {
        threads: cloneMapEntries(state.threads),
    };
}

export function serializeMemoryWorkspaceStore(
    store: MemoryWorkspaceStore,
): PersistedMemoryWorkspaceStore {
    return {
        version: 1,
        info: store.info,
        authors: cloneMapEntries(store.authors),
        permissionsByActor: cloneMapEntries(store.permissionsByActor),
        branches: cloneMapEntries(store.branches),
        participantsByBranch: cloneMapEntries(store.participantsByBranch),
        services: store.services,
        templates: cloneMapEntries(store.templates),
        snapshotsByBranch: Array.from(store.snapshotsByBranch.entries()).map(
            ([branchId, state]) =>
                [branchId, serializeBranchSnapshotState(state)] as const,
        ),
        commentsByBranch: Array.from(store.commentsByBranch.entries()).map(
            ([branchId, state]) =>
                [branchId, serializeCommentsBranchState(state)] as const,
        ),
        policies: store.policies,
        policiesByBranch: cloneMapEntries(store.policiesByBranch),
    };
}

function deserializeBranchSnapshotState(
    state: SerializedBranchSnapshotState,
): BranchSnapshotState {
    const next: BranchSnapshotState = newBranchSnapshotState();
    next.head = state.head;
    next.headSnapshot = state.headSnapshot;
    next.drafts = new Map(state.drafts);
    next.commits = new Map(state.commits);
    return next;
}

function deserializeCommentsBranchState(
    state: SerializedCommentsBranchState,
): CommentsBranchState {
    const next: CommentsBranchState = newCommentsBranchState();
    next.threads = new Map(state.threads);
    return next;
}

export function deserializeMemoryWorkspaceStore(
    store: PersistedMemoryWorkspaceStore,
): MemoryWorkspaceStore {
    return {
        info: { ...store.info },
        authors: new Map(store.authors),
        permissionsByActor: new Map(store.permissionsByActor),
        branches: new Map(store.branches),
        participantsByBranch: new Map(store.participantsByBranch),
        services: store.services,
        templates: new Map(store.templates),
        snapshotsByBranch: new Map(
            store.snapshotsByBranch.map(([branchId, state]) => [
                branchId,
                deserializeBranchSnapshotState(state),
            ]),
        ),
        commentsByBranch: new Map(
            store.commentsByBranch.map(([branchId, state]) => [
                branchId,
                deserializeCommentsBranchState(state),
            ]),
        ),
        policies: store.policies ? { ...store.policies } : null,
        policiesByBranch: new Map(
            store.policiesByBranch.map(([branchId, state]) => [
                branchId,
                { ...state },
            ]),
        ),
    };
}

export function applyPersistedMemoryWorkspaceStore(
    target: MemoryWorkspaceStore,
    source: PersistedMemoryWorkspaceStore,
): void {
    const next: MemoryWorkspaceStore = deserializeMemoryWorkspaceStore(source);

    Object.assign(target.info, next.info);

    target.authors.clear();
    next.authors.forEach((value, key) => target.authors.set(key, value));

    target.permissionsByActor.clear();
    next.permissionsByActor.forEach((value, key) =>
        target.permissionsByActor.set(key, value),
    );

    target.branches.clear();
    next.branches.forEach((value, key) => target.branches.set(key, value));

    target.participantsByBranch.clear();
    next.participantsByBranch.forEach((value, key) =>
        target.participantsByBranch.set(key, value),
    );

    target.services = next.services;

    target.templates.clear();
    next.templates.forEach((value, key) => target.templates.set(key, value));

    target.snapshotsByBranch.clear();
    next.snapshotsByBranch.forEach((value, key) =>
        target.snapshotsByBranch.set(key, value),
    );

    target.commentsByBranch.clear();
    next.commentsByBranch.forEach((value, key) =>
        target.commentsByBranch.set(key, value),
    );

    target.policies = next.policies;

    target.policiesByBranch.clear();
    next.policiesByBranch.forEach((value, key) =>
        target.policiesByBranch.set(key, value),
    );
}

function supportsIndexedDb(): boolean {
    return typeof indexedDB !== "undefined";
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
            reject(request.error ?? new Error("IndexedDB request failed."));
    });
}

function openDatabase(): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const request: IDBOpenDBRequest = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db: IDBDatabase = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "workspaceId" });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
            reject(request.error ?? new Error("Failed to open IndexedDB."));
    });
}

export function createIndexedDbMemoryPersistence(): MemoryPersistence | null {
    if (!supportsIndexedDb()) {
        return null;
    }

    let dbPromise: Promise<IDBDatabase> | null = null;
    let disabled = false;

    const getDb = async (): Promise<IDBDatabase> => {
        if (!dbPromise) {
            dbPromise = openDatabase();
        }
        return dbPromise;
    };

    const disable = (error: unknown): void => {
        disabled = true;
        dbPromise = null;
        console.warn(
            "[memory-backend] IndexedDB persistence disabled for this session.",
            error,
        );
    };

    return {
        load: async (workspaceId: string) => {
            if (disabled) return null;
            try {
                const db: IDBDatabase = await getDb();
                const tx = db.transaction(STORE_NAME, "readonly");
                const store = tx.objectStore(STORE_NAME);
                const record = await requestToPromise<
                    PersistedWorkspaceRecord | undefined
                >(store.get(workspaceId));
                return record?.store ?? null;
            } catch (error) {
                disable(error);
                return null;
            }
        },
        save: async (workspaceId: string, store: MemoryWorkspaceStore) => {
            if (disabled) return;
            try {
                const db: IDBDatabase = await getDb();
                const tx = db.transaction(STORE_NAME, "readwrite");
                const objectStore = tx.objectStore(STORE_NAME);
                const record: PersistedWorkspaceRecord = {
                    workspaceId,
                    store: serializeMemoryWorkspaceStore(store),
                };
                await requestToPromise(objectStore.put(record));
            } catch (error) {
                disable(error);
            }
        },
    };
}
