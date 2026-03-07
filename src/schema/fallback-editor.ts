// src/schema/fallback-editor.ts

import type { DgpServiceMap, ServiceProps } from "@/schema";
import type { OrderSnapshot } from "@/schema/order";
import type { FallbackSettings } from "@/schema/validation";

// Ids
export type ServiceIdRef = number | string; // provider service id
export type NodeIdRef = string; // tag.id or option.id

export type ServiceFallback = {
    /** Node-scoped fallbacks: prefer these when that node’s primary service fails */
    nodes?: Record<NodeIdRef, ServiceIdRef[]>;
    /** Primary→fallback list used when no node-scoped entry is present */
    global?: Record<ServiceIdRef, ServiceIdRef[]>;
};

/**
 * Optional service-map shape.
 * Keep this loose for now so the editor can be reused by host apps.
 */
export type FallbackEditorServiceRecord = {
    id: ServiceIdRef;
    rate?: number;
    service_id?: ServiceIdRef;
    [key: string]: unknown;
};

export type FallbackEditorServiceMap = DgpServiceMap;

export type FallbackRegistrationScope = "global" | "node";

export type FallbackScopeRef =
    | {
          scope: "global";
          primary: ServiceIdRef;
      }
    | {
          scope: "node";
          nodeId: NodeIdRef;
      };

export type FallbackRegistration = {
    scope: FallbackRegistrationScope;
    /**
     * For node scope => node id
     * For global scope => omitted
     */
    scopeId?: NodeIdRef;
    /**
     * The primary DGP service this registration belongs to.
     * For global scope, this is the global key.
     * For node scope, this is resolved from ServiceProps/snapshot context.
     */
    primary: ServiceIdRef;
    /** Registered fallback services */
    services: ServiceIdRef[];
};

export type FallbackCheckReason =
    | "duplicate"
    | "self_reference"
    | "unknown_primary"
    | "unknown_candidate"
    | "missing_snapshot"
    | "node_scope_not_supported"
    | "node_primary_unresolved"
    | "ambiguous_context"
    | "invalid_candidate"
    | "unknown_service"
    | "no_primary"
    | "rate_violation"
    | "constraint_mismatch"
    | "cycle"
    | "no_tag_context"
    | "missing_service_props"
    | "node_not_found";

export type FallbackCandidateCheck = {
    candidate: ServiceIdRef;
    ok: boolean;
    reasons: FallbackCheckReason[];
};

export type FallbackCheckResult = {
    context: FallbackScopeRef;
    /**
     * Resolved primary when known.
     * For global scope this should normally equal context.primary.
     */
    primary?: ServiceIdRef;
    allowed: ServiceIdRef[];
    rejected: FallbackCandidateCheck[];
    warnings: FallbackCheckReason[];
};

export type FallbackEditorState = {
    original: ServiceFallback;
    current: ServiceFallback;
    changed: boolean;
};

export type FallbackEditorOptions = {
    /**
     * The editable payload.
     * The editor clones this and never mutates the caller’s object directly.
     */
    fallbacks?: ServiceFallback;

    /**
     * Optional read-only source used to resolve node→service ownership
     * and validate node-scoped registrations.
     */
    props?: ServiceProps;

    /**
     * Optional runtime context enhancer.
     * Useful for ambiguous node contexts / diagnostics.
     */
    snapshot?: OrderSnapshot;

    /**
     * Optional service map used for rate / existence validation.
     */
    services?: FallbackEditorServiceMap;

    /**
     * Optional fallback policy.
     */
    settings?: FallbackSettings;
};

export type FallbackMutationOptions = {
    /**
     * When true, reject candidates failing validation.
     * When false, keep structurally valid values and return warnings.
     */
    strict?: boolean;
    /**
     * Optional insert position for add/addMany.
     * Omit to append.
     */
    index?: number;
};

export interface FallbackEditor {
    /** Returns original + current editable state */
    state(): FallbackEditorState;

    /** Returns the current editable fallback payload */
    value(): ServiceFallback;

    /** Restores current back to original */
    reset(): FallbackEditorState;

    /**
     * Returns all registrations belonging to a given primary DGP service.
     *
     * With ServiceProps:
     * - includes global registrations
     * - includes node registrations whose node resolves to this primary
     *
     * Without ServiceProps:
     * - global registrations only
     */
    get(serviceId: ServiceIdRef): FallbackRegistration[];

    /**
     * Direct/raw scope lookup.
     * - global => current.global[primary] ?? []
     * - node   => current.nodes[nodeId] ?? []
     */
    getScope(context: FallbackScopeRef): ServiceIdRef[];

    /**
     * Pure validation/preview.
     * If candidates omitted, validates the currently stored scope value.
     */
    check(
        context: FallbackScopeRef,
        candidates?: ServiceIdRef[],
    ): FallbackCheckResult;

    /** Adds one candidate to an exact scope */
    add(
        context: FallbackScopeRef,
        candidate: ServiceIdRef,
        options?: FallbackMutationOptions,
    ): FallbackEditorState;

    /** Adds many candidates to an exact scope */
    addMany(
        context: FallbackScopeRef,
        candidates: ServiceIdRef[],
        options?: FallbackMutationOptions,
    ): FallbackEditorState;

    /** Removes one candidate from an exact scope */
    remove(
        context: FallbackScopeRef,
        candidate: ServiceIdRef,
    ): FallbackEditorState;

    /** Replaces the exact scope value */
    replace(
        context: FallbackScopeRef,
        candidates: ServiceIdRef[],
        options?: FallbackMutationOptions,
    ): FallbackEditorState;

    /** Clears one exact scope value */
    clear(context: FallbackScopeRef): FallbackEditorState;
}

export declare function createFallbackEditor(
    options?: FallbackEditorOptions,
): FallbackEditor;
