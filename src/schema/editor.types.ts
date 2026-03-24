import type { EditorSnapshot, ServiceProps } from "./index";
import { SelectionOptions } from "@/react/canvas/selection";
import { ServiceCatalogState } from "@/schema/catalog";

export type EditorEvents = {
    "editor:command": { name: string; payload?: any };
    "editor:change": {
        props: ServiceProps;
        reason: string;
        command?: string;
        snapshot: EditorSnapshot;
    };
    "editor:undo": { stackSize: number; index: number };
    "editor:redo": { stackSize: number; index: number };
    "editor:error": { message: string; code?: string; meta?: any };

    "catalog:change": {
        catalog?: ServiceCatalogState;
        reason: string;
        snapshot: EditorSnapshot;
    };
    "catalog:active-change": {
        activeNodeId?: string;
    };
};

export type Command = {
    name: string;
    do(): void;
    undo(): void;
};

// wherever EditorOptions is declared
export type EditorOptions = {
    historyLimit?: number;
    validateAfterEach?: boolean;

    /** Sync existence check; return true if the service exists. */
    serviceExists?: (id: number) => boolean;

    /** Optional local index; used if serviceExists is not provided. */
    serviceMap?: Record<number, unknown>;

    /** Raw policies JSON; will be compiled on demand by filterServicesForVisibleGroup. */
    policiesRaw?: unknown;
    selectionProps?: SelectionOptions;
};

export type ConnectKind = "bind" | "include" | "exclude";
