// persisted schema + shared types
export type PricingRole = 'base' | 'utility';
export type FieldType = 'custom' | (string & {});

/** ── Marker types (live inside meta; non-breaking) ───────────────────── */
export type QuantityMark = {
  quantity?: {
    valueBy: 'value' | 'length' | 'eval';
    code?: string;
    multiply?: number;
    clamp?: { min?: number; max?: number };
    fallback?: number;
  };
};

export type UtilityMark = {
  utility?: {
    rate: number;
    mode: 'flat' | 'per_quantity' | 'per_value' | 'percent';
    valueBy?: 'value' | 'length'; // only for per_value; default 'value'
    percentBase?: 'service_total' | 'base_service' | 'all';
    label?: string;
  };
};

type WithQuantityDefault = { quantityDefault?: number };

export interface BaseFieldUI {
    helperText?: string;
    helperTextPos?: string;
    name?: string;
    placeholder?: string;
    label: string;
    labelClassName?: string;
    required?: boolean;
    axis?: 'y' | 'x';
    labelAxis?: 'x' | 'y';
    extra?: any;
}

export type FieldOption = {
    id: string;
    label: string;
    value?: string | number;
    service_id?: number;
    pricing_role?: PricingRole;
    meta?: (Record<string, unknown> & UtilityMark & WithQuantityDefault);
};

export type Field = BaseFieldUI & {
    id: string;
    type: FieldType;                 // only 'custom' is reserved
    bind_id?: string | string[];
    name?: string;                   // omit if options map to services
    options?: FieldOption[];
    component?: string;              // required if type === 'custom'
    pricing_role?: PricingRole;      // default 'base'
    meta?: (Record<string, unknown> & QuantityMark & UtilityMark);
};

export type FlagKey = 'refill' | 'cancel' | 'dripfeed';
export type Tag = {
    id: string;
    label: string;
    bind_id?: string;
    service_id?: number;
    includes?: string[];
    excludes?: string[];
    meta?: (Record<string, unknown> & WithQuantityDefault);
    /**
     * Which flags are set for this tag. If a flag is not set, it's inherited from the nearest ancestor with a value set.
     */
    constraints?: Partial<Record<FlagKey, boolean>>;
    /** Which ancestor defined the *effective* value for each flag (nearest source). */
    constraints_origin?: Partial<Record<FlagKey, string>>; // tagId

    /**
     * Present only when a child explicitly set a different value but was overridden
     * by an ancestor during normalisation.
     */
    constraints_overrides?: Partial<Record<
        FlagKey,
        { from: boolean; to: boolean; origin: string } // child explicit -> effective + where it came from
    >>;
};

export type ServiceProps = {
    order_for_tags?: Record<string, string[]>;
    filters: Tag[];
    fields: Field[];
    includes_for_options?: Record<string, string[]>;
    excludes_for_options?: Record<string, string[]>;
    schema_version?: string;
    fallbacks?: ServiceFallback;
};


// Ids
export type ServiceIdRef = number | string;   // provider service id
export type NodeIdRef = string;               // tag.id or option.id

export type ServiceFallback = {
    /** Node-scoped fallbacks: prefer these when that node’s primary service fails */
    nodes?: Record<NodeIdRef, ServiceIdRef[]>;
    /** Primary→fallback list used when no node-scoped entry is present */
    global?: Record<ServiceIdRef, ServiceIdRef[]>;
};