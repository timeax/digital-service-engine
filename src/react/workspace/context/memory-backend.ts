//@ts-nocheck src/react/workspace/context/backend/memory-backend.ts

import type {
    Actor,
    Branch,
    BranchAccessBackend,
    BranchAccess,
    BranchParticipant,
    BranchesBackend,
    BackendResult,
    FieldTemplate,
    PermissionsBackend,
    PermissionsMap,
    AuthorsBackend,
    ServicesBackend,
    ServicesInput,
    SnapshotsBackend,
    TemplatesBackend,
    WorkspaceBackend,
    WorkspaceInfo,
    Result,
    ServiceSnapshot,
} from "./backend";

import type { DgpServiceCapability, DgpServiceMap } from "@/schema/provider";

/* ---------------- seed ---------------- */

export interface MemorySeed {
    /** Workspace root info (required by WorkspaceBackend) */
    readonly info: WorkspaceInfo;

    /** Acting user/actor id for permissions lookups */
    readonly actorId: string;

    /** Authors visible in workspace */
    readonly authors: readonly Actor[];

    /** Permissions are resolved per actor */
    readonly permissionsByActorId?: Readonly<Record<string, PermissionsMap>>;

    /** Branches + main branch */
    readonly branches: readonly Branch[];
    readonly mainId: string;

    /** Branch participants / access (optional) */
    readonly participantsByBranchId?: Readonly<
        Record<string, readonly BranchParticipant[]>
    >;
    readonly accessByBranchId?: Readonly<Record<string, BranchAccess>>;

    /** Services can be provided as array or map; we normalize to ServicesInput */
    readonly services: readonly DgpServiceCapability[] | DgpServiceMap;

    /** Template library (not branch templates) */
    readonly templates: readonly FieldTemplate[];

    /** Snapshot state */
    readonly snapshot?: ServiceSnapshot;

    /** Draft + head are used by snapshots backend */
    readonly head?: string | null;
    readonly draft?: ServiceSnapshot | null;

    /** Counters for id generation */
    readonly counters?: Readonly<Record<string, number>>;
}

/* ---------------- internal store ---------------- */

interface Store {
    readonly info: WorkspaceInfo;
    readonly actorId: string;

    readonly authors: readonly Actor[];
    readonly permissionsByActorId: Readonly<Record<string, PermissionsMap>>;

    branches: readonly Branch[];
    mainId: string;

    readonly participantsByBranchId: Readonly<
        Record<string, readonly BranchParticipant[]>
    >;
    readonly accessByBranchId: Readonly<Record<string, BranchAccess>>;

    readonly services: ServicesInput;

    templates: readonly FieldTemplate[];

    snapshot?: ServiceSnapshot;
    head?: string | null;
    draft?: ServiceSnapshot | null;

    counters: Record<string, number>;
}

/* ---------------- public factory ---------------- */

export function createMemoryWorkspaceBackend(
    seed: MemorySeed,
): WorkspaceBackend {
    const store: Store = {
        info: seed.info,
        actorId: seed.actorId,

        authors: seed.authors,
        permissionsByActorId: seed.permissionsByActorId ?? {},

        branches: seed.branches,
        mainId: seed.mainId,

        participantsByBranchId: seed.participantsByBranchId ?? {},
        accessByBranchId: seed.accessByBranchId ?? {},

        services: normaliseServicesInput(seed.services),

        templates: seed.templates,

        snapshot: seed.snapshot,
        head: seed.head ?? null,
        draft: seed.draft ?? null,

        counters: { ...(seed.counters ?? {}) },
    };

    return {
        info: store.info,

        authors: createAuthorsBackend(store),
        permissions: createPermissionsBackend(store),
        branches: createBranchesBackend(store),
        access: createAccessBackend(store),
        services: createServicesBackend(store),

        templates: createTemplatesBackend(store),
        snapshots: createSnapshotsBackend(store),
    };
}

/* ---------------- authors ---------------- */

function createAuthorsBackend(store: Store): AuthorsBackend {
    return {
        async list(args) {
            // args.workspaceId exists in the contract; memory backend is single-workspace so we ignore.
            void args;
            return ok(store.authors);
        },

        async get(args) {
            void args;
            return ok(store.authors);
        },

        async refresh(args) {
            void args;
            return ok(store.authors);
        },
    };
}

/* ---------------- permissions ---------------- */

function createPermissionsBackend(store: Store): PermissionsBackend {
    return {
        async get({ workspaceId, actor }) {
            void workspaceId;

            const perms =
                store.permissionsByActorId[actor.id] ??
                store.permissionsByActorId[store.actorId] ??
                {};

            return ok(perms);
        },

        async refresh({ workspaceId, actor }) {
            void workspaceId;

            const perms =
                store.permissionsByActorId[actor.id] ??
                store.permissionsByActorId[store.actorId] ??
                {};

            return ok(perms);
        },
    };
}

/* ---------------- branches ---------------- */

function createBranchesBackend(store: Store): BranchesBackend {
    return {
        async list(workspaceId) {
            void workspaceId;
            return ok({ branches: store.branches, mainId: store.mainId });
        },

        async create(workspaceId, input) {
            void workspaceId;

            const id = nextId(store, "branch");
            const now = new Date().toISOString();

            const b: Branch = {
                id,
                name: input.name,
                description: input.description,
                createdAt: now,
                updatedAt: now,
                meta: input.meta,
            };

            store.branches = [...store.branches, b];
            return ok(b);
        },

        async setMain(workspaceId, branchId) {
            void workspaceId;
            store.mainId = branchId;
            return ok({ branches: store.branches, mainId: store.mainId });
        },

        async merge(workspaceId, fromId, intoId) {
            // memory backend: noop merge, just report success
            void workspaceId;
            void fromId;
            void intoId;
            return ok(true);
        },

        async delete(workspaceId, branchId) {
            void workspaceId;

            store.branches = store.branches.filter((b) => b.id !== branchId);
            if (store.mainId === branchId) {
                store.mainId = store.branches[0]?.id ?? store.mainId;
            }

            return ok({ branches: store.branches, mainId: store.mainId });
        },

        async refresh(workspaceId) {
            void workspaceId;
            return ok({ branches: store.branches, mainId: store.mainId });
        },
    };
}

/* ---------------- branch access ---------------- */

function createAccessBackend(store: Store): BranchAccessBackend {
    return {
        async get({ workspaceId, actor, branchId }) {
            void workspaceId;
            void actor;

            const access = store.accessByBranchId[branchId] ?? {
                canRead: true,
                canWrite: true,
                canAdmin: false,
            };

            const participants = store.participantsByBranchId[branchId] ?? [];

            return ok({ access, participants });
        },

        async refresh({ workspaceId, actor, branchId }) {
            void workspaceId;
            void actor;

            const access = store.accessByBranchId[branchId] ?? {
                canRead: true,
                canWrite: true,
                canAdmin: false,
            };

            const participants = store.participantsByBranchId[branchId] ?? [];

            return ok({ access, participants });
        },
    };
}

/* ---------------- services (FIXED) ---------------- */

function createServicesBackend(store: Store): ServicesBackend {
    return {
        async get({ workspaceId }) {
            void workspaceId;
            return ok(store.services);
        },

        async refresh({ workspaceId }) {
            void workspaceId;
            return ok(store.services);
        },
    };
}

function normaliseServicesInput(
    src: readonly DgpServiceCapability[] | DgpServiceMap,
): ServicesInput {
    const items: DgpServiceCapability[] = Array.isArray(src)
        ? [...src]
        : Object.values(src ?? {});

    const byId: DgpServiceMap = {} as any;
    const byKey: Record<string, DgpServiceCapability> = {};

    for (const s of items) {
        if (!s) continue;

        const id: unknown = (s as any).id;
        if (id !== undefined && id !== null) {
            (byId as any)[id as any] = s;
        }

        const key: unknown = (s as any).key;
        if (typeof key === "string" && key) {
            byKey[key] = s;
        }
    }

    return { items, byId, byKey };
}

/* ---------------- templates ---------------- */

function createTemplatesBackend(store: Store): TemplatesBackend {
    return {
        async list() {
            return ok(store.templates);
        },

        async get(id) {
            const t = store.templates.find((x) => x.id === id);
            return t ? ok(t) : err("not_found");
        },

        async create(input) {
            const id = nextId(store, "template");
            const now = new Date().toISOString();

            const t: FieldTemplate = {
                id,
                key: input.key,
                label: input.label,
                description: input.description,
                createdAt: now,
                updatedAt: now,
                meta: input.meta,
                schema: input.schema,
            };

            store.templates = [...store.templates, t];
            return ok(t);
        },

        async update(id, patch) {
            const idx = store.templates.findIndex((x) => x.id === id);
            if (idx < 0) return err("not_found");

            const now = new Date().toISOString();
            const prev = store.templates[idx];

            const next: FieldTemplate = {
                ...prev,
                ...patch,
                id: prev.id,
                updatedAt: now,
            };

            const nextAll = [...store.templates];
            nextAll[idx] = next;
            store.templates = nextAll;

            return ok(next);
        },

        async remove(id) {
            const before = store.templates.length;
            store.templates = store.templates.filter((x) => x.id !== id);
            return ok(store.templates.length !== before);
        },

        async publish(id) {
            void id;
            return ok(true);
        },
    };
}

/* ---------------- snapshots ---------------- */

function createSnapshotsBackend(store: Store): SnapshotsBackend {
    return {
        async load({ workspaceId, branchId }) {
            void workspaceId;
            void branchId;

            // minimal: return current head/draft snapshot state
            return ok({
                snapshot: store.snapshot ?? null,
                head: store.head ?? null,
                draft: store.draft ?? null,
            });
        },

        async getDraft({ workspaceId, branchId }) {
            void workspaceId;
            void branchId;
            return ok(store.draft ?? null);
        },

        async autosaveDraft({ workspaceId, branchId, draft }) {
            void workspaceId;
            void branchId;
            store.draft = draft;
            return ok(true);
        },

        async publish({ workspaceId, branchId }) {
            void workspaceId;
            void branchId;

            // publish draft -> snapshot (head)
            if (store.draft) {
                store.snapshot = store.draft;
                store.draft = null;
                store.head = store.snapshot?.id ?? store.head ?? null;
            }

            return ok({
                snapshot: store.snapshot ?? null,
                head: store.head ?? null,
                draft: store.draft ?? null,
            });
        },

        async discard({ workspaceId, branchId }) {
            void workspaceId;
            void branchId;

            store.draft = null;

            return ok({
                snapshot: store.snapshot ?? null,
                head: store.head ?? null,
                draft: store.draft ?? null,
            });
        },
    };
}

/* ---------------- helpers ---------------- */

function nextId(store: Store, key: string): string {
    const n = (store.counters[key] ?? 0) + 1;
    store.counters[key] = n;
    return `${key}_${n}`;
}

function ok<T>(data: T): BackendResult<T> {
    return { ok: true, data };
}

function err(code: string, message?: string): BackendResult<never> {
    return { ok: false, error: { code, message } };
}
