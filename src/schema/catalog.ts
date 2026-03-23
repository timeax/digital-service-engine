export type CatalogId = string;
export type CatalogServiceId = string | number;

export type CatalogNodeKind = "group" | "smart-group";

export type CatalogSmartRule =
    | {
          type: "service-field";
          field: string;
          op:
              | "eq"
              | "neq"
              | "in"
              | "contains"
              | "startsWith"
              | "endsWith"
              | "gt"
              | "gte"
              | "lt"
              | "lte"
              | "between"
              | "exists";
          value?: unknown;
          min?: number;
          max?: number;
      }
    | {
          type: "policy-family";
          key: string;
          value?: unknown;
      }
    | {
          type: "compatibility";
          scope: "tag" | "field" | "option" | "visible-group";
          targetId?: string;
          mode: "safe" | "assignable" | "same-family" | "conflicts";
      };

export type CatalogNodeBase = {
    id: CatalogId;
    label: string;
    parentId?: CatalogId;
    description?: string;
    order?: number;
    color?: string;
    icon?: string;
    collapsed?: boolean;
    meta?: Record<string, unknown>;
};

export type CatalogGroupNode = CatalogNodeBase & {
    kind: "group";
    serviceIds: CatalogServiceId[];
};

export type CatalogSmartGroupNode = CatalogNodeBase & {
    kind: "smart-group";
    rules: CatalogSmartRule[];
    match: "all" | "any";
    resolvedServiceIds?: CatalogServiceId[];
    resolvedAt?: number;
};

export type CatalogNode = CatalogGroupNode | CatalogSmartGroupNode;

export type CatalogViewMode = "all" | "grouped" | "smart" | "assigned";

export interface ServiceCatalogState {
    version: 1;
    nodes: CatalogNode[];
    activeNodeId?: CatalogId;
    expandedIds?: CatalogId[];
    pinnedNodeIds?: CatalogId[];
    selectedServiceId?: CatalogServiceId;
    viewMode?: CatalogViewMode;
    meta?: Record<string, unknown>;
}
