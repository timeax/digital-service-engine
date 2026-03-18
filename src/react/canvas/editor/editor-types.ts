import type { Builder, ServiceCheck } from "@/core";
import type { PolicyDiagnostic } from "@/core/policy";
import type {
    Command,
    EditorEvents,
    EditorOptions,
    EditorSnapshot,
    Field,
    ServiceProps,
    Tag,
} from "@/schema";
import type { CanvasAPI } from "../api";

export type WireKind = "bind" | "include" | "exclude" | "service";

export type TagRef = { kind: "tag"; id: string };
export type FieldRef = { kind: "field"; id: string };
export type OptionRef = { kind: "option"; fieldId: string; id: string };
export type NodeRef = TagRef | FieldRef | OptionRef;

export type DuplicateOptions = {
    withChildren?: boolean;
    copyBindings?: boolean;
    copyIncludesExcludes?: boolean;
    copyOptionMaps?: boolean;
    id?: string;
    labelStrategy?: (old: string) => string;
    nameStrategy?: (old?: string) => string | undefined;
    optionIdStrategy?: (old: string) => string;
};

export type EditorNodeLookup =
    | { kind: "tag"; data?: Tag; owners: { parentTagId?: string } }
    | { kind: "field"; data?: Field; owners: { bindTagIds: string[] } }
    | { kind: "option"; data?: any; owners: { fieldId?: string } };

export type QuantityRule = {
    valueBy: "value" | "length" | "eval";
    code?: string;
    multiply?: number;
    clamp?: { min?: number; max?: number };
    fallback?: number;
};

export type { ServiceCheck };

export type EditorModuleContext = {
    builder: Builder;
    api: CanvasAPI;
    opts: Required<EditorOptions>;
    getProps: () => ServiceProps;
    isTagId: (id: string) => boolean;
    isFieldId: (id: string) => boolean;
    isOptionId: (id: string) => boolean;
    transact: (label: string, fn: () => void) => void;
    exec: (cmd: Command) => void;
    undo: () => boolean;
    patchProps: (mut: (p: ServiceProps) => void) => void;
    replaceProps: (next: ServiceProps) => void;
    emit: <K extends keyof (EditorEvents & any)>(
        event: K,
        payload: (EditorEvents & any)[K],
    ) => void;
    makeSnapshot: (why: string) => EditorSnapshot;
    loadSnapshot: (s: EditorSnapshot, reason: "undo" | "redo") => void;
    getNode: (id: string) => EditorNodeLookup;
    uniqueId: (base: string) => string;
    uniqueOptionId: (fieldId: string, base: string) => string;
    genId: (prefix: "t" | "f" | "o") => string;
    setLastPolicyDiagnostics: (value: PolicyDiagnostic[] | undefined) => void;
};
