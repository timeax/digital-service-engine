// src/core/validate/steps/service-vs-input.ts
import type { ValidationCtx } from "../shared";
import { hasAnyServiceOption } from "../shared";

function hasButtonTriggerMap(v: ValidationCtx, fieldId: string): boolean {
    const includes = v.props.includes_for_buttons?.[fieldId];
    const excludes = v.props.excludes_for_buttons?.[fieldId];

    return (
        (Array.isArray(includes) && includes.length > 0) ||
        (Array.isArray(excludes) && excludes.length > 0)
    );
}

export function validateServiceVsUserInput(v: ValidationCtx): void {
    for (const f of v.fields) {
        const anySvc: boolean = hasAnyServiceOption(f);
        const hasName: boolean = !!(f.name && f.name.trim());
        const isButton: boolean = f.button === true;
        const hasFieldService: boolean =
            f.service_id !== undefined && f.service_id !== null;
        const hasTriggerMap: boolean = isButton && hasButtonTriggerMap(v, f.id);

        if (f.type === "custom" && anySvc) {
            v.errors.push({
                code: "user_input_field_has_service_option",
                severity: "error",
                message: `Custom field "${f.id}" cannot map service options.`,
                nodeId: f.id,
                details: { reason: "custom_cannot_map_service" },
            });
        }

        if (!hasName) {
            if (hasFieldService || anySvc || hasTriggerMap) {
                continue;
            }

            v.errors.push({
                code: "service_field_missing_service_id",
                severity: "error",
                message: isButton
                    ? `Button field "${f.id}" has no "name", no "service_id", and no includes/excludes trigger map. Add a name, attach a service_id, or configure includes_for_buttons/excludes_for_buttons.`
                    : `Service-backed field "${f.id}" has no "name" and must provide at least one option with a service_id.`,
                nodeId: f.id,
            });
        } else {
            if (anySvc) {
                v.errors.push({
                    code: "user_input_field_has_service_option",
                    severity: "error",
                    message: `User-input field "${f.id}" has a name and must not include any options with service_id.`,
                    nodeId: f.id,
                });
            }
        }
    }
}
