import { describe, expect, it } from "vitest";
import { validate } from "@/core/validate";

describe("validate visibility dependency cycles", () => {
    it("detects visibility dependency cycle when a revealed option removes its revealer", () => {
        const props = {
            schema_version: "1.0",
            filters: [{ id: "t:root", label: "Root" }],
            fields: [
                {
                    id: "f:package",
                    type: "select",
                    label: "Package",
                    bind_id: "t:root",
                    options: [{ id: "o:premium", label: "Premium" }],
                },
                {
                    id: "f:quality",
                    type: "select",
                    label: "Quality",
                    options: [
                        {
                            id: "o:remove-premium",
                            label: "Remove Premium",
                        },
                    ],
                },
            ],
            option_effects_for_buttons: {
                "o:premium": {
                    "f:quality": { forceVisible: true },
                },
                "o:remove-premium": {
                    "f:package": { exclude: ["o:premium"] },
                },
            },
        };

        const errors = validate(props as any);
        expect(errors.map((e) => e.code)).toContain(
            "visibility_dependency_cycle",
        );
    });

    it("detects cycle when an option effect include list omits an ancestor option on the ancestor owner field", () => {
        const props = {
            schema_version: "1.0",
            filters: [{ id: "t:root", label: "Root" }],
            fields: [
                {
                    id: "f:package",
                    type: "select",
                    label: "Package",
                    bind_id: "t:root",
                    options: [
                        { id: "o:premium", label: "Premium" },
                        { id: "o:basic", label: "Basic" },
                    ],
                },
                {
                    id: "f:quality",
                    type: "select",
                    label: "Quality",
                    options: [{ id: "o:strict", label: "Strict" }],
                },
            ],
            option_effects_for_buttons: {
                "o:premium": {
                    "f:quality": { forceVisible: true },
                },
                "o:strict": {
                    "f:package": { include: ["o:basic"] },
                },
            },
        };

        const errors = validate(props as any);
        expect(errors.map((e) => e.code)).toContain(
            "visibility_dependency_cycle",
        );
    });

    it("detects cycle when reachable trigger hides the field that owns an ancestor option", () => {
        const props = {
            schema_version: "1.0",
            filters: [{ id: "t:root", label: "Root" }],
            fields: [
                {
                    id: "f:package",
                    type: "select",
                    label: "Package",
                    bind_id: "t:root",
                    options: [{ id: "o:premium", label: "Premium" }],
                },
                {
                    id: "f:advanced",
                    type: "select",
                    label: "Advanced",
                    options: [
                        {
                            id: "o:hide-package",
                            label: "Hide Package",
                        },
                    ],
                },
            ],
            option_effects_for_buttons: {
                "o:premium": {
                    "f:advanced": { forceVisible: true },
                },
            },
            excludes_for_buttons: {
                "o:hide-package": ["f:package"],
            },
        };

        const errors = validate(props as any);
        expect(errors.map((e) => e.code)).toContain(
            "visibility_dependency_cycle",
        );
    });

    it("does not reject harmless mutual reveals", () => {
        const props = {
            schema_version: "1.0",
            filters: [{ id: "t:root", label: "Root" }],
            fields: [
                {
                    id: "f:a",
                    type: "select",
                    label: "A",
                    bind_id: "t:root",
                    options: [{ id: "o:a", label: "A" }],
                },
                {
                    id: "f:b",
                    type: "select",
                    label: "B",
                    options: [{ id: "o:b", label: "B" }],
                },
            ],
            option_effects_for_buttons: {
                "o:a": {
                    "f:b": { forceVisible: true },
                },
                "o:b": {
                    "f:a": { forceVisible: true },
                },
            },
        };

        const errors = validate(props as any);
        expect(errors.map((e) => e.code)).not.toContain(
            "visibility_dependency_cycle",
        );
    });

    it("detects visibility dependency cycles through nested child options", () => {
        const props = {
            schema_version: "1.0",
            filters: [{ id: "t:root", label: "Root" }],
            fields: [
                {
                    id: "f:package",
                    type: "select",
                    label: "Package",
                    bind_id: "t:root",
                    options: [
                        {
                            id: "o:parent",
                            label: "Parent",
                            children: [{ id: "o:child", label: "Child" }],
                        },
                    ],
                },
                {
                    id: "f:target",
                    type: "select",
                    label: "Target",
                    options: [
                        {
                            id: "o:remove-child",
                            label: "Remove Child",
                        },
                    ],
                },
            ],
            option_effects_for_buttons: {
                "o:child": {
                    "f:target": { forceVisible: true },
                },
                "o:remove-child": {
                    "f:package": { exclude: ["o:child"] },
                },
            },
        };

        const errors = validate(props as any);
        expect(errors.map((e) => e.code)).toContain(
            "visibility_dependency_cycle",
        );
    });
});
