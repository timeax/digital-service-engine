// src/core/validate/index.ts
import type { ServiceProps, Tag, Field } from "@/schema";
import type { DgpServiceMap } from "@/schema/provider";
import type { ValidationError, ValidatorOptions } from "@/schema/validation";

import {
    createFieldsVisibleUnder,
    validateVisibility,
} from "./steps/visibility";
import { validateStructure } from "./steps/structure";
import { validateIdentity } from "./steps/identity";
import { validateOptionMaps } from "./steps/option-maps";
import { validateServiceVsUserInput } from "./steps/service-vs-input";
import { validateUtilityMarkers } from "./steps/utility";
import { validateRates } from "./steps/rates";
import { validateConstraints } from "./steps/constraints";
import { validateCustomFields } from "./steps/custom";
import { validateGlobalUtilityGuard } from "./steps/global-utility-guard";
import { validateUnboundFields } from "./steps/unbound";
import { validateFallbacks } from "./steps/fallbacks";

import { applyPolicies } from "./policies/apply-policies";
import type { ValidationCtx } from "./shared";
import { buildNodeMap } from "@/core/node-map";

/**
 * We read simulation options from ctx without changing the public ValidatorOptions type.
 * (So UI can pass these without needing schema/type changes immediately.)
 */
type VisibilitySimOpts = Readonly<{
    simulate?: boolean;
    maxStates?: number;
    maxDepth?: number;
    simulateAllRoots?: boolean;
    onlyEffectfulTriggers?: boolean;
}>;

function readVisibilitySimOpts(ctx: ValidatorOptions): VisibilitySimOpts {
    const c = ctx as any;

    const simulate =
        c.simulateVisibility === true ||
        c.visibilitySimulate === true ||
        c.simulate === true;

    const maxStates =
        typeof c.maxVisibilityStates === "number"
            ? c.maxVisibilityStates
            : typeof c.visibilityMaxStates === "number"
              ? c.visibilityMaxStates
              : typeof c.maxStates === "number"
                ? c.maxStates
                : undefined;

    const maxDepth =
        typeof c.maxVisibilityDepth === "number"
            ? c.maxVisibilityDepth
            : typeof c.visibilityMaxDepth === "number"
              ? c.visibilityMaxDepth
              : typeof c.maxDepth === "number"
                ? c.maxDepth
                : undefined;

    const simulateAllRoots =
        c.simulateAllRoots === true || c.visibilitySimulateAllRoots === true;

    const onlyEffectfulTriggers =
        c.onlyEffectfulTriggers === false
            ? false
            : c.visibilityOnlyEffectfulTriggers !== false; // default true

    return {
        simulate,
        maxStates,
        maxDepth,
        simulateAllRoots,
        onlyEffectfulTriggers,
    };
}

/**
 * Core synchronous validate.
 */
export function validate(
    props: ServiceProps,
    ctx: ValidatorOptions = {},
): ValidationError[] {
    const errors: ValidationError[] = [];
    const serviceMap: DgpServiceMap = ctx.serviceMap ?? {};
    const selectedKeys: Set<string> = new Set<string>(
        ctx.selectedOptionKeys ?? [],
    );

    const tags: Tag[] = Array.isArray(props.filters) ? props.filters : [];
    const fields: Field[] = Array.isArray(props.fields) ? props.fields : [];

    const tagById: Map<string, Tag> = new Map<string, Tag>();
    const fieldById: Map<string, Field> = new Map<string, Field>();

    for (const t of tags) tagById.set(t.id, t);
    for (const f of fields) fieldById.set(f.id, f);

    const v: ValidationCtx = {
        props,
        nodeMap: ctx.nodeMap ?? buildNodeMap(props),
        options: ctx,
        errors,
        serviceMap,
        selectedKeys,
        tags,
        fields,
        tagById,
        fieldById,
        fieldsVisibleUnder: (_tagId: string): Field[] => [],
    };

    // 1) structure
    validateStructure(v);

    // 2) identity + labels
    validateIdentity(v);

    // 3) option maps
    validateOptionMaps(v);

    // 4) visibility helpers + visibility rules (optionally simulated)
    v.fieldsVisibleUnder = createFieldsVisibleUnder(v);

    const visSim = readVisibilitySimOpts(ctx);
    validateVisibility(v, visSim);

    // --------- Dynamic policies (super-admin) --------------------------
    applyPolicies(
        v.errors,
        v.props,
        v.serviceMap,
        v.options.policies,
        v.fieldsVisibleUnder,
        v.tags,
    );

    // 5) service vs user-input rules
    validateServiceVsUserInput(v);

    // 6) utility marker rules
    validateUtilityMarkers(v);

    // 7) rates & pricing roles
    validateRates(v);

    // 8) constraints vs capabilities + inheritance
    validateConstraints(v);

    // 9) custom field rules
    validateCustomFields(v);

    // 10) optional global utility guard
    validateGlobalUtilityGuard(v);

    // 11) unbound fields
    validateUnboundFields(v);

    // 12) fallbacks strict-mode conversion
    validateFallbacks(v);

    return v.errors;
}

/**
 * UI-friendly async wrapper:
 * - yields to microtask queue
 * - then yields to the next animation frame (so paint can happen)
 * - then runs validate()
 */
export async function validateAsync(
    props: ServiceProps,
    ctx: ValidatorOptions = {},
): Promise<ValidationError[]> {
    // microtask yield
    await Promise.resolve();

    // next paint/frame yield (browser environments)
    if (typeof requestAnimationFrame === "function") {
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
        );
    } else {
        // non-browser fallback
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    return validate(props, ctx);
}
