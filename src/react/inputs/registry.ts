import type React from "react";
import { Field, ServiceProps, Ui } from "@/schema";

/** Matches your InputWrapper’s expectations */
export type InputKind = string; // e.g. "text", "number", "select", "custom:Rating"
export type InputVariant = "default" | (string & {});
/* -------------------------------------------------------------------------- */
/* Adapter rules (updated meaning)                                            */
/* - getValue: normalize what host emitted into stored value (for form-palette)*/
/* - getSelectedOptions: REQUIRED if field.options exists (no guessing)        */
/* - isActive: optional for option-less action buttons                         */
/* -------------------------------------------------------------------------- */

export type AdapterCtx = { field: Field; props: ServiceProps };

export type Adapter = {
    valueProp?: string;
    changeProp?: string;
    errorProp?: string;

    /** normalize what the host emitted into what we store in form-palette */
    getValue?: (next: unknown, current: unknown, ctx: AdapterCtx) => unknown;

    /** REQUIRED if field.options exists */
    getSelectedOptions?: (
        next: unknown,
        current: unknown,
        ctx: AdapterCtx,
    ) => string[];

    /** For option-less action buttons (button: true with no options) */
    isActive?: (stored: unknown, ctx: AdapterCtx) => boolean;
    getInputPropsFromField?: (props: AdapterCtx) => any;
    toValue?: (value: any) => any;
};

export type InputChildOptionCapability = {
    supported?: boolean;
    autoCreate?: boolean;
    defaultLabel?: string;
    defaultValue?: string | number;
};

export type InputOptionCapability = {
    supported?: boolean;
    autoCreate?: boolean;
    defaultLabel?: string;
    defaultValue?: string | number;
    children?: InputChildOptionCapability;
};

export type InputMultiCapability = {
    supported?: boolean;
    autoEnable?: boolean;
};

export type InputDescriptor = {
    Component: React.ComponentType<Record<string, unknown>>;
    adapter?: Adapter;
    defaultProps?: Record<string, unknown>;
    ui?: Record<string, Ui>;
    options?: InputOptionCapability;
    multi?: InputMultiCapability;
};

type VariantMap = Map<InputVariant, InputDescriptor>;
type RegistryStore = Map<InputKind, VariantMap>;

export type Registry = {
    get(kind: InputKind, variant?: InputVariant): InputDescriptor | undefined;
    register(
        kind: InputKind,
        descriptor: InputDescriptor,
        variant?: InputVariant,
    ): void;
    unregister(kind: InputKind, variant?: InputVariant): void;
    registerMany(
        entries: Array<{
            kind: InputKind;
            descriptor: InputDescriptor;
            variant?: InputVariant;
        }>,
    ): void;
    /** low-level escape hatch */
    _store: RegistryStore;
};

export function createInputRegistry(): Registry {
    const store: RegistryStore = new Map();

    const get = (
        kind: InputKind,
        variant?: InputVariant,
    ): InputDescriptor | undefined => {
        const vm = store.get(kind);
        if (!vm) return undefined;
        const v = (variant ?? "default") as InputVariant;
        return vm.get(v) ?? vm.get("default");
    };

    const register = (
        kind: InputKind,
        descriptor: InputDescriptor,
        variant?: InputVariant,
    ): void => {
        let vm = store.get(kind);
        if (!vm) {
            vm = new Map<InputVariant, InputDescriptor>();
            store.set(kind, vm);
        }
        vm.set((variant ?? "default") as InputVariant, descriptor);
    };

    const unregister = (kind: InputKind, variant?: InputVariant): void => {
        const vm = store.get(kind);
        if (!vm) return;
        const key = (variant ?? "default") as InputVariant;
        vm.delete(key);
        if (vm.size === 0) store.delete(kind);
    };

    const registerMany = (
        entries: Array<{
            kind: InputKind;
            descriptor: InputDescriptor;
            variant?: InputVariant;
        }>,
    ): void => {
        for (const e of entries) register(e.kind, e.descriptor, e.variant);
    };

    return { get, register, unregister, registerMany, _store: store };
}

/** Helper used by InputWrapper */
export function resolveInputDescriptor(
    registry: Registry,
    kind: InputKind,
    variant?: InputVariant,
): InputDescriptor | undefined {
    return registry.get(kind, variant);
}
