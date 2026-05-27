import type { Scalar } from "@/schema/order";
import type { FallbackSettings } from "@/schema/validation";

export type BuildOrderSnapshotSettings = {
    mode?: "prod" | "dev";
    hostDefaultQuantity?: number;
    fallback?: FallbackSettings;
    workspaceId?: string;
    builderCommit?: string;
};

export type BuildOrderSelection = {
    activeTagId: string;
    formValuesByFieldId: Record<string, Scalar | Scalar[]>;
    optionSelectionsByFieldId: Record<string, string[]>;
    selectedKeys?: string[];
    optionTraversalOrder?: Array<{ fieldId: string; optionId: string }>;
};

export type SelectedNodeVisit =
    | { kind: "field"; fieldId: string }
    | { kind: "option"; fieldId: string; optionId: string };
