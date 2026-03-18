import { Field, FieldValidationRule, Scalar } from "@/schema";

export type FieldValidationIssue = {
    fieldId: string;
    message: string;
    rule: FieldValidationRule;
};

export function evaluateFieldValidationRule(
    rule: FieldValidationRule,
    raw: Scalar | Scalar[] | undefined,
): boolean {
    const valueBy = rule.valueBy ?? "value";

    let subject: unknown = raw;

    if (valueBy === "length") {
        if (typeof raw === "string" || Array.isArray(raw)) subject = raw.length;
        else subject = 0;
    }

    if (valueBy === "eval") {
        if (typeof rule.code !== "string" || !rule.code.trim()) return true;
        try {
            const fn = new Function("value", "values", rule.code);
            subject = fn(raw, Array.isArray(raw) ? raw : [raw]);
        } catch {
            return true;
        }
    }

    switch (rule.op) {
        case "eq":
            return subject === rule.value;
        case "neq":
            return subject !== rule.value;
        case "gt":
            return Number(subject) > Number(rule.value);
        case "gte":
            return Number(subject) >= Number(rule.value);
        case "lt":
            return Number(subject) < Number(rule.value);
        case "lte":
            return Number(subject) <= Number(rule.value);
        case "between":
            return (
                Number(subject) >= Number(rule.min) &&
                Number(subject) <= Number(rule.max)
            );
        case "in":
            return Array.isArray(rule.values) && rule.values.includes(subject);
        case "nin":
            return Array.isArray(rule.values) && !rule.values.includes(subject);
        case "truthy":
            return !!subject;
        case "falsy":
            return !subject;
        case "match":
            return typeof subject === "string" &&
                typeof rule.pattern === "string"
                ? new RegExp(rule.pattern, rule.flags ?? "").test(subject)
                : false;
        default:
            return true;
    }
}

export function validateVisibleFields(
    visibleFieldIds: string[],
    fieldById: Map<string, Field>,
    formValuesByFieldId: Record<string, Scalar | Scalar[]>,
): FieldValidationIssue[] {
    const out: FieldValidationIssue[] = [];

    for (const fid of visibleFieldIds) {
        const field = fieldById.get(fid);
        if (!field?.validation?.length) continue;

        const value = formValuesByFieldId[fid];

        for (const rule of field.validation) {
            const ok = evaluateFieldValidationRule(rule, value);
            if (!ok) {
                out.push({
                    fieldId: fid,
                    message: rule.message || `${field.label} is invalid`,
                    rule,
                });
                break;
            }
        }
    }

    return out;
}
