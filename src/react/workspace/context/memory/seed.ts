// src/react/workspace/context/backend/memory/seed.ts

import type {
    Actor,
    Author,
    Branch,
    BranchParticipant,
    Commit,
    Draft,
    PermissionsMap,
    ServiceSnapshot,
    ServicesInput,
    WorkspaceInfo,
} from "../backend";

import type { CommentThread } from "@/schema/comments";

export interface MemorySeedBranchSnapshots {
    readonly head?: Commit;
    readonly draft?: Draft;
    readonly snapshot?: ServiceSnapshot;
}

export type MemorySeedParticipants = Readonly<
    Record<string, readonly BranchParticipant[]>
>;

export type MemorySeedBranchSnapshotsMap = Readonly<
    Record<string, MemorySeedBranchSnapshots>
>;

export type MemorySeedComments = Readonly<
    Record<string, readonly CommentThread[]>
>;

export type SeededPermissions =
    | PermissionsMap
    | Readonly<Record<string, PermissionsMap>>;

export interface MemoryBackendSeed {
    readonly info?: Partial<WorkspaceInfo>;

    readonly actor?: Partial<Actor>;
    readonly authors?: readonly Author[];

    readonly permissions?: SeededPermissions;

    readonly branches?: readonly Branch[];

    /** participants keyed by branchId */
    readonly participants?: MemorySeedParticipants;

    readonly services?: ServicesInput;

    /** templates may be global (no branchId) or branch-scoped (branchId set) */
    readonly templates?: readonly any[]; // FieldTemplate lives in backend.ts; keep seed ergonomic

    /** snapshots keyed by branchId */
    readonly snapshots?: MemorySeedBranchSnapshotsMap;

    /** comments threads keyed by branchId */
    readonly comments?: MemorySeedComments;

    /** workspace policies */
    readonly policies?: unknown;

    /** branch policies keyed by branchId */
    readonly policiesByBranch?: Readonly<Record<string, unknown>>;
}

export interface CreateMemoryWorkspaceBackendOptions {
    readonly workspaceId: string;
    readonly actorId?: string;

    /**
     * If true (default), ensure a main branch exists.
     * If branches are seeded but none isMain=true, the first becomes main.
     */
    readonly ensureMain?: boolean;

    /**
     * If true (default), ensure at least one author exists.
     * If authors are not seeded, one author is created from actorId.
     */
    readonly ensureActorAuthor?: boolean;

    /** Seed data to preload the in-memory store */
    readonly seed?: MemoryBackendSeed;
}
