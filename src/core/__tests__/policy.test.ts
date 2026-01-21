import { describe, it, expect } from "vitest";
import { compilePolicies, splitPolicyDiagnostics } from "../policy";

describe("compilePolicies()", () => {
    it("defaults scope/subject/filter.role/severity/projection", () => {
        const raw = [{ id: "r1", label: "R1", op: "unique" }];
        const { policies, diagnostics } = compilePolicies(raw);

        expect(policies[0]).toMatchObject({
            id: "r1",
            label: "R1",
            scope: "visible_group",
            subject: "services",
            filter: { role: "both" },
            severity: "error",
            projection: "service.id",
            op: "unique",
        });

        expect(diagnostics.length).toBe(0);
    });

    it("accepts arrays or scalars in filter ids and defaults role", () => {
        const { policies, diagnostics } = compilePolicies([
            {
                id: "filt",
                label: "Filter",
                op: "unique",
                filter: { tag_id: "root", field_id: ["f1", "f2"] },
            },
        ]);

        expect(policies[0].filter?.tag_id).toEqual(["root"]);
        expect(policies[0].filter?.field_id).toEqual(["f1", "f2"]);
        expect(policies[0].filter?.role).toBe("both");
        expect(diagnostics.length).toBe(0);
    });

    it("generates id when missing and warns", () => {
        const { policies, diagnostics } = compilePolicies([{ op: "unique" }]);
        expect(policies[0].id).toMatch(/^policy_\d+$/);

        const { warnings } = splitPolicyDiagnostics(diagnostics);
        expect(warnings.some((w) => /Missing "id"/.test(w.message))).toBe(true);
    });

    it("errors on invalid op and on missing numeric value for max_count", () => {
        const { policies, diagnostics } = compilePolicies([
            { id: "bad1", op: "nope" },
            { id: "bad2", op: "max_count" },
        ]);

        expect(policies.length).toBe(0);

        const { errors } = splitPolicyDiagnostics(diagnostics);
        expect(errors.some((e) => e.path === "op")).toBe(true);
        expect(errors.some((e) => e.path === "value")).toBe(true);
    });

    it('warns when projection for services does not start with "service."', () => {
        const { diagnostics } = compilePolicies([
            { id: "r", op: "unique", projection: "key" },
        ]);

        const { warnings } = splitPolicyDiagnostics(diagnostics);
        expect(warnings.some((w) => w.path === "projection")).toBe(true);
    });

    it("warns when value is provided but unused for all_true/any_true", () => {
        const { diagnostics } = compilePolicies([
            { id: "r1", op: "all_true", value: true },
            { id: "r2", op: "any_true", value: false },
        ]);

        const { warnings } = splitPolicyDiagnostics(diagnostics);
        expect(warnings.filter((w) => w.path === "value").length).toBe(2);
    });

    it("normalises filter.where and warns on invalid entries", () => {
        const { policies, diagnostics } = compilePolicies([
            {
                id: "w1",
                op: "unique",
                filter: {
                    where: [
                        { path: "service.handler_id", op: "eq", value: 7 },
                        { path: "", op: "eq", value: 1 }, // invalid (empty path)
                        { path: "handler_id", op: "eq", value: 1 }, // warns (missing service. prefix)
                        { path: "service.platform_id", op: "nope", value: 2 }, // warns (bad op -> eq)
                        { path: "service.x", op: "in", value: "nope" }, // warns (in expects array)
                    ],
                },
            },
        ]);

        // valid ones survive; invalid empty-path entry is dropped
        expect(
            policies[0].filter?.where?.some(
                (w) => w.path === "service.handler_id",
            ),
        ).toBe(true);
        expect(policies[0].filter?.where?.some((w) => w.path === "")).toBe(
            false,
        );

        const { warnings } = splitPolicyDiagnostics(diagnostics);

        expect(
            warnings.some((w) => w.path?.includes("filter.where[1].path")),
        ).toBe(true);
        expect(
            warnings.some((w) => w.path?.includes("filter.where[2].path")),
        ).toBe(true);
        expect(
            warnings.some((w) => w.path?.includes("filter.where[3].op")),
        ).toBe(true);
        expect(
            warnings.some((w) => w.path?.includes("filter.where[4].value")),
        ).toBe(true);
    });

    it("defaults invalid scope/subject and emits warnings (but still compiles)", () => {
        const { policies, diagnostics } = compilePolicies([
            {
                id: "sx",
                op: "unique",
                scope: "nope" as any,
                subject: "nope" as any,
            },
        ]);

        expect(policies.length).toBe(1);
        expect(policies[0]).toMatchObject({
            id: "sx",
            scope: "visible_group",
            subject: "services",
        });

        const { warnings } = splitPolicyDiagnostics(diagnostics);
        expect(warnings.some((w) => w.path === "scope")).toBe(true);
        expect(warnings.some((w) => w.path === "subject")).toBe(true);
    });

    it('warns when "label" is missing (but still compiles)', () => {
        const { policies, diagnostics } = compilePolicies([
            { id: "r1", op: "unique" },
        ]);

        expect(policies.length).toBe(1);
        expect(policies[0].id).toBe("r1");

        const { warnings } = splitPolicyDiagnostics(diagnostics);
        expect(warnings.some((w) => w.path === "label")).toBe(true);
    });
});
