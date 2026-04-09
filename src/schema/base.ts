// persisted schema + shared types
import type { ServiceFallback } from "@/schema/fallback-editor";
import type { IdType } from "./provider";

export type ServiceIdRef = IdType;

export type PricingRole = "base" | "utility";
export type FieldType = "custom" | (string & {});

/** ── Marker types (live inside meta; non-breaking) ───────────────────── */
export type QuantityMark = {
    quantity?: {
        valueBy: "value" | "length" | "eval";
        code?: string;
        multiply?: number;
        clamp?: { min?: number; max?: number };
        fallback?: number;
    };
};

export type UtilityMark = {
    utility?: {
        rate: number;
        mode: "flat" | "per_quantity" | "per_value" | "percent";
        valueBy?: "value" | "length"; // only for per_value; default 'value'
        percentBase?: "service_total" | "base_service" | "all";
        label?: string;
    };
};

export type WithQuantityDefault = { quantityDefault?: number };

/** ---------------- Core schema (as you designed) ---------------- */

export interface BaseFieldUI {
    name?: string;
    label: string;
    required?: boolean;
    /** Host-defined prop names → runtime default values (untyped base) */
    defaults?: Record<string, unknown>;
}

export type Ui = (
    | UiString
    | UiNumber
    | UiBoolean
    | UiAnyOf
    | UiArray
    | UiObject
) & { description: string; label: string };

/** string */
export interface UiString {
    type: "string";
    enum?: string[];
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
}

/** number */
export interface UiNumber {
    type: "number";
    minimum?: number;
    maximum?: number;
    multipleOf?: number;
}

/** boolean */
export interface UiBoolean {
    type: "boolean";
}

/** enumerated choices */
export interface UiAnyOf {
    type: "anyOf";
    multiple?: boolean;
    items: Array<{
        type: "string" | "number" | "boolean";
        title?: string;
        description?: string;
        value: string | number | boolean;
    }>;
}

/** arrays: homogeneous (item) or tuple (items) */
export interface UiArray {
    type: "array";
    label: string;
    description: string;

    item?: Ui;
    items?: Ui[];
    editable?: boolean;

    /**
     * Optional: allowed shapes for new items.
     * Key = label shown in UI picker
     * Value = schema for the new element
     */
    shape?: Record<string, Ui>;

    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;
}
/** objects: nested props */
export interface UiObject {
    type: "object";
    label: string;
    description: string;

    editable?: boolean;
    fields: Record<string, Ui>;

    /**
     * Optional: allowed shapes for dynamically added keys.
     * Key = human-readable name shown in UI picker
     * Value = schema applied to the value of the new key
     */
    shape?: Record<string, Ui>;

    required?: string[];
    order?: string[];
}

/** ---------------- Typed defaults helpers ---------------- */

/**
 * UiValue<U>: given a Ui node U, infer the runtime value type.
 */
export type UiValue<U extends Ui> =
    // primitives
    U extends { type: "string" }
        ? string
        : U extends { type: "number" }
          ? number
          : U extends { type: "boolean" }
            ? boolean
            : // anyOf
              U extends { type: "anyOf"; multiple: true }
              ? Array<U["items"][number]["value"]>
              : U extends { type: "anyOf" }
                ? U["items"][number]["value"]
                : // array (homogeneous vs tuple)
                  U extends { type: "array"; item: infer I extends Ui }
                  ? Array<UiValue<I>>
                  : U extends { type: "array"; items: infer T extends Ui[] }
                    ? { [K in keyof T]: UiValue<T[K]> }
                    : // object (nested fields)
                      U extends {
                            type: "object";
                            fields: infer F extends Record<string, Ui>;
                        }
                      ? { [K in keyof F]?: UiValue<F[K]> }
                      : unknown;

export type FieldValidationValueBy = "value" | "length" | "eval";

export type FieldValidationOp =
    | "eq"
    | "neq"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "between"
    | "in"
    | "nin"
    | "truthy"
    | "falsy"
    | "match";

export type FieldValidationRule = {
    valueBy?: FieldValidationValueBy;
    op: FieldValidationOp;
    value?: unknown;
    min?: number;
    max?: number;
    values?: unknown[];
    pattern?: string;
    flags?: string;
    code?: string;
    message?: string;
};

/**
 * FieldWithTypedDefaults<T>: same shape as BaseFieldUI, but:
 *  - ui is a concrete map T (propName → Ui node)
 *  - defaults are auto-typed from T via UiValue
 */
export type FieldWithTypedDefaults<T extends Record<string, Ui>> = Omit<
    BaseFieldUI,
    "ui" | "defaults"
> & {
    ui: T;
    defaults?: Partial<{ [K in keyof T]: UiValue<T[K]> }>;
};

export type FieldOption = {
    id: string;
    label: string;
    value?: string | number;
    service_id?: ServiceIdRef;
    pricing_role?: PricingRole;
    meta?: Record<string, unknown> & UtilityMark & WithQuantityDefault;
};

export type Field = BaseFieldUI & {
    id: string;
    type: FieldType; // only 'custom' is reserved
    bind_id?: string | string[];
    name?: string; // omit if options map to services
    options?: FieldOption[];
    description?: string;
    component?: string; // required if type === 'custom'
    pricing_role?: PricingRole; // default 'base'
    validation?: FieldValidationRule[];
    meta?: Record<string, unknown> &
        QuantityMark &
        UtilityMark & { multi?: boolean };
} & (
        | {
              button?: false;
              service_id?: undefined;
          }
        | ({
              button: true;
              service_id?: ServiceIdRef;
          } & WithQuantityDefault)
    );

export type ConstraintKey = string;

/**
 * Back-compat alias: older code may still import FlagKey.
 * Keeping this prevents a wave of TS errors while still allowing any string key.
 */
export type FlagKey = ConstraintKey;

export type Tag = {
    id: string;
    label: string;
    bind_id?: string;
    service_id?: ServiceIdRef;
    includes?: string[];
    excludes?: string[];
    meta?: Record<string, unknown> & WithQuantityDefault;

    /**
     * Which flags are set for this tag. If a flag is not set, it's inherited from the nearest ancestor with a value set.
     */
    constraints?: Partial<Record<ConstraintKey, boolean>>;

    /** Which ancestor defined the *effective* value for each flag (nearest source). */
    constraints_origin?: Partial<Record<ConstraintKey, string>>; // tagId

    /**
     * Present only when a child explicitly set a different value but was overridden
     * by an ancestor during normalisation.
     */
    constraints_overrides?: Partial<
        Record<
            ConstraintKey,
            { from: boolean; to: boolean; origin: string } // child explicit -> effective + where it came from
        >
    >;
};

export type ServiceProps = {
    order_for_tags?: Record<string, string[]>;
    orderKinds?: Record<string, string>;
    filters: Tag[];
    fields: Field[];
    includes_for_buttons?: Record<string, string[]>;
    excludes_for_buttons?: Record<string, string[]>;
    schema_version?: string;
    fallbacks?: ServiceFallback;
    name?: string;
    notices?: ServicePropsNotice[];
};

//--- notices
export type NoticeType = "public" | "private"; // client-facing vs workspace/admin

export type NoticeSeverity = "info" | "warning" | "error";

/**
 * “label” is lightweight + UI-friendly (best, sale, hot, etc).
 * Others remain semantic / governance oriented.
 */
export type NoticeKind =
    | "label"
    | "warning"
    | "deprecation"
    | "compat"
    | "migration"
    | "policy";

export type NoticeTarget =
    | { scope: "global" }
    | { scope: "node"; node_kind: "tag" | "field" | "option"; node_id: string };

export interface ServicePropsNotice {
    id: string; // stable unique ID
    type: NoticeType; // public/private
    kind: NoticeKind; // includes "label"
    severity: NoticeSeverity;

    target: NoticeTarget;

    title: string; // what to show (e.g. "Best", "50% off", "Deprecated")
    description?: string;
    reason?: string; // more internal / audit wording

    marked_at?: string; // ISO string (when applied / introduced)

    // optional for UI
    icon?: string; // e.g. "sparkles", "badge-percent", etc (client decides)
    color?: string; // token string e.g. "gold", "danger", "muted" (avoid hardcoding palettes)
    meta?: Record<string, unknown>;
}
