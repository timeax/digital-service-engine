import type { Field } from "@/schema";
import type { Scalar } from "@/schema/order";
import type { BuildOrderSelection } from "./types";
import { isServiceBased } from "./services";

export function buildInputs(
    visibleFieldIds: string[],
    fieldById: Map<string, Field>,
    selection: BuildOrderSelection,
    selectedOptionsByFieldId: Record<string, string[]>,
): {
    formValues: Record<string, Scalar | Scalar[]>;
    selections: Record<string, string[]>;
} {
    const formValues: Record<string, Scalar | Scalar[]> = {};
    const selections: Record<string, string[]> = {};

    for (const fid of visibleFieldIds) {
        const field = fieldById.get(fid);
        if (!field) continue;

        const selectedOptionIds = selectedOptionsByFieldId[fid];
        if (selectedOptionIds?.length) selections[fid] = [...selectedOptionIds];

        if (!isServiceBased(field)) {
            const name = field.name;
            const value = selection.formValuesByFieldId[fid];
            if (!name || value === undefined) continue;
            formValues[name] = value;
        }
    }

    return { formValues, selections };
}
