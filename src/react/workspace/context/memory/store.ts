// src/react/workspace/context/backend/memory/store.ts
import type {
    Author,
    Branch,
    BranchParticipant,
    Commit,
    Draft,
    FieldTemplate,
    MergeResult,
    PermissionsMap,
    ServiceSnapshot,
    ServicesInput,
    WorkspaceInfo,
} from "../backend";

import type {
    CommentAnchor,
    CommentMessage,
    CommentThread,
    ThreadId,
    CommentId,
} from "@/schema/comments";

export type DraftKey = string; // `${branchId}:${actorId}`

export interface BranchSnapshotState {
    /** per (branchId,actorId) draft pointer */
    readonly draftsByKey: Map<DraftKey, Draft>;
    /** commits by id */
    readonly commitsById: Map<string, Commit>;
    /** head commit id (if any) */
    headCommitId?: string;
    /** current snapshot payload (latest loaded/saved/autosaved) */
    snapshot: ServiceSnapshot;
}

export interface CommentsState {
    readonly threadsById: Map<string, CommentThread>;
}

export interface MemoryWorkspaceStore {
    readonly info: WorkspaceInfo;

    readonly authorsById: Map<string, Author>;
    readonly branchesById: Map<string, Branch>;

    /** branchId -> participants */
    readonly participantsByBranchId: Map<string, readonly BranchParticipant[]>;

    /** services input (array or map) */
    services: ServicesInput;

    /** templates by id */
    readonly templatesById: Map<string, FieldTemplate>;

    /** branchId -> snapshot state */
    readonly snapshotsByBranchId: Map<string, BranchSnapshotState>;

    /** branchId -> comments state */
    readonly commentsByBranchId: Map<string, CommentsState>;

    /** actorId -> permissions map (optional); missing => permissive map */
    readonly permissionsByActorId: Map<string, PermissionsMap>;
}

/* ---------------- comments helper (in-memory shapes) ---------------- */

export interface CreateThreadInput {
    readonly anchor: CommentAnchor;
    readonly body: string;
    readonly meta?: Record<string, unknown>;
}

export interface AddMessageInput {
    readonly threadId: ThreadId;
    readonly body: string;
    readonly meta?: Record<string, unknown>;
}

export interface EditMessageInput {
    readonly threadId: ThreadId;
    readonly messageId: CommentId;
    readonly body: string;
}

export interface MoveThreadInput {
    readonly threadId: ThreadId;
    readonly anchor: CommentAnchor;
}

export interface ResolveThreadInput {
    readonly threadId: ThreadId;
    readonly resolved: boolean;
}

export interface DeleteThreadInput {
    readonly threadId: ThreadId;
}

/* ---------------- branches helper ---------------- */

export interface MergeInput {
    readonly sourceId: string;
    readonly targetId: string;
}

export interface MergeState {
    readonly result: MergeResult;
}
