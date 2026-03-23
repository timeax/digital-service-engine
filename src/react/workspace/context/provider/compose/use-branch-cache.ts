// src/react/workspace/context/provider/compose/use-branch-cache.ts
import * as React from "react";
import type { BranchCacheEntry, Loadable, SnapshotSlice } from "../types";
import type { FieldTemplate, BranchParticipant } from "../../backend";

import { createCache, createIndexedDBDriver } from "@timeax/cache-store";
import type { CacheStore } from "@timeax/cache-store";

export interface BranchCacheApi {
    /**
     * Clear cached branch scopes for THIS workspace.
     */
    readonly clear: () => void;

    readonly switchBranch: (
        args: Readonly<{
            /**
             * Redundant on purpose: call-sites must pass workspaceId explicitly,
             * and the hook is also workspace-scoped.
             *
             * This allows us to detect wiring bugs (mismatched workspace scopes).
             */
            workspaceId: string;

            nextId: string;
            prevId?: string;

            templates: Loadable<readonly FieldTemplate[]>;
            participants: Loadable<readonly BranchParticipant[]>;
            snapshot: SnapshotSlice;

            setTemplates: React.Dispatch<
                React.SetStateAction<Loadable<readonly FieldTemplate[]>>
            >;
            setParticipants: React.Dispatch<
                React.SetStateAction<Loadable<readonly BranchParticipant[]>>
            >;
            setSnapshot: React.Dispatch<React.SetStateAction<SnapshotSlice>>;

            resetTemplates: () => void;
            resetParticipants: () => void;
            resetSnapshot: () => void;

            setCurrentBranchId: (id: string) => void;
            getCurrentBranchId: () => string | undefined;
            getCurrentSnapshot: () => SnapshotSlice;
        }>,
    ) => void;
}

const DB_NAME = "dgp-cache";
const STORE_NAME = "kv";
const NS = "workspace";

// Key scheme (per workspace):
//   ws:<workspaceId>:branch:<branchId>
const WS_PREFIX = "ws:";
const keyOf = (workspaceId: string, branchId: string): string =>
    `${WS_PREFIX}${workspaceId}:branch:${branchId}`;

const branchPrefixOf = (workspaceId: string): string =>
    `${WS_PREFIX}${workspaceId}:branch:`;

type PendingSwitch = Readonly<{
    token: number;
    workspaceId: string;
    nextId: string;

    getCurrentBranchId: () => string | undefined;
    getCurrentSnapshot: () => SnapshotSlice;

    setTemplates: React.Dispatch<
        React.SetStateAction<Loadable<readonly FieldTemplate[]>>
    >;
    setParticipants: React.Dispatch<
        React.SetStateAction<Loadable<readonly BranchParticipant[]>>
    >;
    setSnapshot: React.Dispatch<React.SetStateAction<SnapshotSlice>>;
}>;

function hasSnapshotProps(data: unknown): boolean {
    if (!data || typeof data !== "object") return false;
    const props = (data as { props?: unknown }).props;
    return Boolean(props && typeof props === "object");
}

function hasUsableSnapshot(slice?: SnapshotSlice): boolean {
    return Boolean(
        slice &&
            typeof slice.schemaVersion === "string" &&
            slice.schemaVersion.length > 0 &&
            hasSnapshotProps(slice.data),
    );
}

export function useBranchCache(workspaceId: string): BranchCacheApi {
    // IndexedDB-backed cache instance (scoped by ns + key prefixing).
    const cache: CacheStore = React.useMemo(() => {
        return createCache({
            driver: createIndexedDBDriver({
                dbName: DB_NAME,
                storeName: STORE_NAME,
                ns: NS,
            }),
            hydrate: true,
            cleanupExpiredOnHydrate: true,
        });
    }, []);

    const wsIdRef = React.useRef<string>(workspaceId);
    React.useEffect(() => {
        wsIdRef.current = workspaceId;
    }, [workspaceId]);

    // IDB hydration is async. We keep it internal to preserve the hook API.
    const readyRef = React.useRef<boolean>(cache.isReady());
    const switchTokenRef = React.useRef(0);

    // If switchBranch runs before hydration completes, defer the cache-apply decision.
    const pendingRef = React.useRef<PendingSwitch | null>(null);

    const applyPendingCacheIfSafe = React.useCallback(
        (p: PendingSwitch): void => {
            if (p.token !== switchTokenRef.current) return;
            if (p.getCurrentBranchId() !== p.nextId) return;
            if (hasUsableSnapshot(p.getCurrentSnapshot())) return;

            const cached = cache.get<BranchCacheEntry>(
                keyOf(p.workspaceId, p.nextId),
            );
            if (!cached) return;

            p.setTemplates(cached.templates);
            p.setParticipants(cached.participants);

            if (hasUsableSnapshot(cached.snapshot)) {
                p.setSnapshot(cached.snapshot);
            }
        },
        [cache],
    );

    React.useEffect(() => {
        if (cache.isReady()) {
            readyRef.current = true;
            return;
        }

        const unsub = cache.subscribeReady(() => {
            readyRef.current = true;

            const p = pendingRef.current;
            if (!p) return;

            applyPendingCacheIfSafe(p);
            pendingRef.current = null;
        });

        return () => unsub();
    }, [cache, applyPendingCacheIfSafe]);

    const clear = React.useCallback((): void => {
        switchTokenRef.current += 1;
        pendingRef.current = null;

        // Clear ONLY this workspace scope.
        cache.clear(branchPrefixOf(wsIdRef.current));
    }, [cache]);

    const switchBranch = React.useCallback(
        (
            args: Readonly<{
                workspaceId: string;

                nextId: string;
                prevId?: string;

                templates: Loadable<readonly FieldTemplate[]>;
                participants: Loadable<readonly BranchParticipant[]>;
                snapshot: SnapshotSlice;

                setTemplates: React.Dispatch<
                    React.SetStateAction<Loadable<readonly FieldTemplate[]>>
                >;
                setParticipants: React.Dispatch<
                    React.SetStateAction<Loadable<readonly BranchParticipant[]>>
                >;
                setSnapshot: React.Dispatch<
                    React.SetStateAction<SnapshotSlice>
                >;

                resetTemplates: () => void;
                resetParticipants: () => void;
                resetSnapshot: () => void;

                setCurrentBranchId: (id: string) => void;
                getCurrentBranchId: () => string | undefined;
                getCurrentSnapshot: () => SnapshotSlice;
            }>,
        ): void => {
            const token = switchTokenRef.current + 1;
            switchTokenRef.current = token;

            const hookWsId: string = wsIdRef.current;
            const callWsId: string = args.workspaceId;

            // Redundant-by-design safety check (catch wiring mistakes).
            if (callWsId !== hookWsId) {
                // Keep it non-fatal (warn) to avoid breaking UX in production.
                // eslint-disable-next-line no-console
                console.warn(
                    `[useBranchCache] workspaceId mismatch: hook="${hookWsId}" vs switchBranch="${callWsId}". Using switchBranch workspaceId.`,
                );
            }

            const wsId: string = callWsId;
            const prevId: string | undefined = args.prevId;

            // Cache previous branch scope (per workspace).
            if (prevId && prevId !== args.nextId) {
                cache.set<BranchCacheEntry>(keyOf(wsId, prevId), {
                    templates: args.templates,
                    participants: args.participants,
                    snapshot: args.snapshot,
                });
            }

            // Try to read cached next branch from mirror (may be empty before hydration).
            const cached = cache.get<BranchCacheEntry>(
                keyOf(wsId, args.nextId),
            );
            const cachedSnapshot = hasUsableSnapshot(cached?.snapshot)
                ? cached!.snapshot
                : undefined;

            if (cached) {
                args.setTemplates(cached.templates);
                args.setParticipants(cached.participants);
            } else {
                args.resetTemplates();
                args.resetParticipants();
            }

            if (cachedSnapshot) {
                args.setSnapshot(cachedSnapshot);
            } else {
                args.resetSnapshot();
            }

            args.setCurrentBranchId(args.nextId);

            // If not hydrated yet, defer the no-cache => load decision because hydration
            // might still reveal a valid cached snapshot for this workspace+branch.
            if (!readyRef.current && !cachedSnapshot) {
                pendingRef.current = {
                    token,
                    workspaceId: wsId,
                    nextId: args.nextId,
                    getCurrentBranchId: args.getCurrentBranchId,
                    getCurrentSnapshot: args.getCurrentSnapshot,
                    setTemplates: args.setTemplates,
                    setParticipants: args.setParticipants,
                    setSnapshot: args.setSnapshot,
                };
                return;
            }

            pendingRef.current = null;
        },
        [cache],
    );

    return React.useMemo<BranchCacheApi>(
        () => ({ clear, switchBranch }),
        [clear, switchBranch],
    );
}
