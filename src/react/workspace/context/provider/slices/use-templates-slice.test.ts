import { describe, expect, it } from "vitest";
import type { FieldTemplate } from "@/react/workspace";
import { __templatesSliceInternals } from "./use-templates-slice";

function makeTemplate(
    id: string,
    overrides?: Partial<FieldTemplate>,
): FieldTemplate {
    return {
        id,
        key: `key-${id}`,
        name: `Template ${id}`,
        kind: "text",
        definition: {},
        published: true,
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

describe("useTemplatesSlice helpers", () => {
    it("resolves conflict to incoming when both template timestamps are missing", () => {
        const current = makeTemplate("same", {
            updatedAt: "" as unknown as string,
            createdAt: "" as unknown as string,
            name: "Current",
        });
        const incoming = makeTemplate("same", {
            updatedAt: "" as unknown as string,
            createdAt: "" as unknown as string,
            name: "Incoming",
        });

        const result = __templatesSliceInternals.pickNewestTemplate(
            current,
            incoming,
        );

        expect(result.name).toBe("Incoming");
    });

    it("infers deletion from missing delta entries only when reconcileMissingSince is true", () => {
        const current = [
            makeTemplate("keep", { updatedAt: "2026-01-01T00:00:00.000Z" }),
            makeTemplate("delete-me", {
                updatedAt: "2026-07-03T00:00:00.000Z",
            }),
        ];

        const withoutReconcile = __templatesSliceInternals.mergeTemplates(
            current,
            [],
            {
                since: "2026-07-02T12:00:00.000Z",
                reconcileMissingSince: false,
            },
        );
        expect(withoutReconcile.some((item) => item.id === "delete-me")).toBe(
            true,
        );

        const withReconcile = __templatesSliceInternals.mergeTemplates(
            current,
            [],
            {
                since: "2026-07-02T12:00:00.000Z",
                reconcileMissingSince: true,
            },
        );
        expect(withReconcile.some((item) => item.id === "delete-me")).toBe(
            false,
        );
    });
});
