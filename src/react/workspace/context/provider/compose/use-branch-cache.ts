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

            hasInitialSnapshot: boolean;

            loadSnapshotForBranch: (branchId: string) => void;
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
    workspaceId: string;
    nextId: string;
    hasInitialSnapshot: boolean;

    setTemplates: React.Dispatch<
        React.SetStateAction<Loadable<readonly FieldTemplate[]>>
    >;
    setParticipants: React.Dispatch<
        React.SetStateAction<Loadable<readonly BranchParticipant[]>>
    >;
    setSnapshot: React.Dispatch<React.SetStateAction<SnapshotSlice>>;

    loadSnapshotForBranch: (branchId: string) => void;
}>;

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

    // If switchBranch runs before hydration completes, we defer the “load snapshot” decision.
    const pendingRef = React.useRef<PendingSwitch | null>(null);

    const applyCached = React.useCallback(
        (
            wsId: string,
            nextId: string,
            p: PendingSwitch,
        ): { cached?: BranchCacheEntry; hasCachedSnapshot: boolean } => {
            const cached = cache.get<BranchCacheEntry>(keyOf(wsId, nextId));

            if (cached) {
                p.setTemplates(cached.templates);
                p.setParticipants(cached.participants);
                p.setSnapshot(cached.snapshot);
            }

            const hasCachedSnapshot = Boolean(
                cached?.snapshot?.data && cached?.snapshot?.schemaVersion,
            );

            return { cached, hasCachedSnapshot };
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

            const { hasCachedSnapshot } = applyCached(
                p.workspaceId,
                p.nextId,
                p,
            );

            if (!hasCachedSnapshot && !p.hasInitialSnapshot) {
                p.loadSnapshotForBranch(p.nextId);
            }

            pendingRef.current = null;
        });

        return () => unsub();
    }, [cache, applyCached]);

    const clear = React.useCallback((): void => {
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

                hasInitialSnapshot: boolean;

                loadSnapshotForBranch: (branchId: string) => void;
            }>,
        ): void => {
            const hookWsId: string = wsIdRef.current;
            const callWsId: string = args.workspaceId;

            // Redundant-by-design safety check (catch wiring mistakes).
            if (callWsId !== hookWsId) {
                // Keep it non-fatal (warn) to avoid breaking UX in production.
                // If you want strict behavior later, we can throw in dev only.
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

            if (cached) {
                args.setTemplates(cached.templates);
                args.setParticipants(cached.participants);
                args.setSnapshot(cached.snapshot);
            } else {
                args.resetTemplates();
                args.resetParticipants();
                args.resetSnapshot();
            }

            args.setCurrentBranchId(args.nextId);

            const hasCachedSnapshot: boolean = Boolean(
                cached?.snapshot?.data && cached?.snapshot?.schemaVersion,
            );

            // If not hydrated yet, defer the “no cache → load snapshot” decision because hydration
            // might bring in a cached snapshot for this workspace+branch.
            if (!readyRef.current && !hasCachedSnapshot) {
                pendingRef.current = {
                    workspaceId: wsId,
                    nextId: args.nextId,
                    hasInitialSnapshot: args.hasInitialSnapshot,
                    setTemplates: args.setTemplates,
                    setParticipants: args.setParticipants,
                    setSnapshot: args.setSnapshot,
                    loadSnapshotForBranch: args.loadSnapshotForBranch,
                };
                return;
            }

            // Normal behavior once ready (or when already has cached snapshot).
            if (!hasCachedSnapshot && !args.hasInitialSnapshot) {
                args.loadSnapshotForBranch(args.nextId);
            } else {
                pendingRef.current = null;
            }
        },
        [cache],
    );

    return React.useMemo<BranchCacheApi>(
        () => ({ clear, switchBranch }),
        [clear, switchBranch],
    );
}
