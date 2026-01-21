// Transport-agnostic backend interfaces the HOST must implement

import {
    Actor,
    BackendScope,
    WorkspaceBackend,
} from "@/react/workspace/context/backend";

export type CanvasBackend = {
    comments?: WorkspaceBackend["comments"];
};

export type CanvasBackendOptions = {
    backend?: CanvasBackend;
    workspaceId?: string; // host-provided scope for loading/saving
} & Partial<BackendScope>;
