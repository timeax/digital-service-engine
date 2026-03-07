import type { ServiceIdRef } from "@/schema";

export type EditorSettings = {
    requireConstraintFit: boolean;
    ratePolicy: "lte_primary" | "ignore";
    selectionStrategy: "priority" | "cheapest";
    mode: "strict" | "dev";
};

export type ServiceSummary = {
    id: ServiceIdRef;
    name: string;
    platform?: string;
    rate?: number;
    flags?: Record<string, boolean>;
    description?: string;
};

export type RegistrationScope = "global" | "node";

export type RegistrationItem = {
    primary: ServiceIdRef;
    scope: RegistrationScope;
    scopeId?: string;
    nodeKind?: "tag" | "field" | "option";
    nodeLabel?: string;
    services: ServiceIdRef[];
};

export type ValidationTone = "ok" | "warn" | "error";

export type ValidationMessage = {
    primary: ServiceIdRef;
    scope: RegistrationScope;
    scopeId?: string;
    candidate?: ServiceIdRef;
    tone: ValidationTone;
    title: string;
    message: string;
};

export type FallbackEditorData = {
    services: ServiceSummary[];
    registrations: RegistrationItem[];
    diagnostics: ValidationMessage[];
    settings: EditorSettings;
};
