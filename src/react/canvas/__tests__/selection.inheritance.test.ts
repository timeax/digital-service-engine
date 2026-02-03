import { describe, expect, it } from "vitest";
import { createBuilder } from "@/core";
import { Selection } from "../selection";

// Minimal “builder” double for Selection (we only need getProps()).
function mkBuilder(props: any) {
    const build = createBuilder({});
    build.load(props);
    return build;
}

function idsSorted(x: string[]) {
    return x.slice().sort();
}

describe("Selection.visibleGroup() — inheritance rules", () => {
    it("bind inheritance: field bound to root is visible when selecting a child tag", () => {
        const props = {
            filters: [
                { id: "t:root", label: "Root" },
                { id: "t:Child", label: "Child", bind_id: "t:root" },
            ],
            fields: [
                { id: "f:rootBound", label: "RootBound", bind_id: "t:root" },
                { id: "f:childBound", label: "ChildBound", bind_id: "t:Child" },
            ],
        };

        const builder = mkBuilder(props);
        const sel = new Selection(builder, {
            env: "client",
            rootTagId: "t:root",
        });

        sel.replace("t:Child");

        const out = sel.visibleGroup();
        expect(out.kind).toBe("single");
        const group = (out as any).group;

        // Root-bound is inherited by descendants; child-bound is visible too.
        expect(group.fieldIds).toEqual(["f:rootBound", "f:childBound"]);
    });

    it("tag includes/excludes are NOT inherited: parent excludes do not hide inherited bound fields in a child", () => {
        const props = {
            filters: [
                { id: "t:root", label: "Root" },
                {
                    id: "t:P",
                    label: "Parent",
                    bind_id: "t:root",
                    includes: ["f:parentIncludeOnly"], // should NOT affect child
                    excludes: ["f:parentBoundA", "f:parentBoundB"], // should NOT affect child
                },
                { id: "t:C", label: "Child", bind_id: "t:P" },
            ],
            fields: [
                { id: "f:rootBound", label: "RootBound", bind_id: "t:root" },

                // bound to parent; these SHOULD be inherited by child via bind inheritance
                { id: "f:parentBoundA", label: "ParentBoundA", bind_id: "t:P" },
                { id: "f:parentBoundB", label: "ParentBoundB", bind_id: "t:P" },

                // not bound; only parent tag "includes" it
                { id: "f:parentIncludeOnly", label: "ParentIncludeOnly" },

                // child-bound
                { id: "f:childBound", label: "ChildBound", bind_id: "t:C" },
            ],
        };

        const builder = mkBuilder(props);
        const sel = new Selection(builder, {
            env: "client",
            rootTagId: "t:root",
        });

        // Selecting parent: excludes apply (for that tag group only)
        sel.replace("t:P");
        const p = sel.visibleGroup();
        expect(p.kind).toBe("single");
        const pg = (p as any).group;
        expect(idsSorted(pg.fieldIds)).toEqual(
            idsSorted([
                "f:rootBound",
                "f:parentIncludeOnly", // included by parent tag.includes
                // parentBoundA/B are excluded while on t:P
            ]),
        );

        // Selecting child: parent excludes/includes should NOT be inherited
        sel.replace("t:C");
        const c = sel.visibleGroup();
        expect(c.kind).toBe("single");
        const cg = (c as any).group;

        // Child should see:
        // - rootBound (inherited)
        // - parentBoundA/B (inherited via bind)  ✅ NOT hidden by parent tag.excludes
        // - childBound (bound to child)
        // - NOT parentIncludeOnly (since tag.includes not inherited)
        expect(idsSorted(cg.fieldIds)).toEqual(
            idsSorted([
                "f:rootBound",
                "f:parentBoundA",
                "f:parentBoundB",
                "f:childBound",
            ]),
        );
    });

    it("button rules inherit down; ancestor exclude can hide a visible field; descendant include overrides ancestor exclude", () => {
        const props = {
            filters: [
                { id: "t:root", label: "Root" },
                { id: "t:A", label: "A", bind_id: "t:root" },
                { id: "t:B", label: "B", bind_id: "t:A" },
            ],
            fields: [
                // make the target VISIBLE by default in B via bind inheritance
                { id: "f:target", label: "Target", bind_id: "t:root" },

                // triggers (bound so they are visible in B too)
                {
                    id: "f:ancToggle",
                    label: "AncToggle",
                    bind_id: "t:A",
                    options: [{ id: "o:ancHide", label: "Hide Target" }],
                },
                {
                    id: "f:descToggle",
                    label: "DescToggle",
                    bind_id: "t:B",
                    options: [{ id: "o:descShow", label: "Show Target" }],
                },
            ],
            excludes_for_buttons: { "o:ancHide": ["f:target"] },
            includes_for_buttons: { "o:descShow": ["f:target"] },
        };

        const builder = mkBuilder(props);
        const sel = new Selection(builder, {
            env: "client",
            rootTagId: "t:root",
        });

        sel.replace("t:B");

        // baseline: target is visible (because bound to root)
        const base = sel.visibleGroup();
        expect(base.kind).toBe("single");
        expect((base as any).group.fieldIds).toContain("f:target");

        // ancestor exclude should hide it in descendant context
        sel.add("f:ancToggle");
        sel.add("o:ancHide");

        const r1 = sel.visibleGroup();
        expect(r1.kind).toBe("single");
        expect((r1 as any).group.fieldIds).not.toContain("f:target");

        // descendant include should override the ancestor exclude
        sel.add("f:descToggle");
        sel.add("o:descShow");

        const r2 = sel.visibleGroup();
        expect(r2.kind).toBe("single");
        expect((r2 as any).group.fieldIds).toContain("f:target");
    });

    it("ignores button triggers from non-lineage tags", () => {
        const props = {
            filters: [
                { id: "t:root", label: "Root" },
                { id: "t:A", label: "A", bind_id: "t:root" },
                { id: "t:B", label: "B", bind_id: "t:A" },
                { id: "t:X", label: "X", bind_id: "t:root" },
            ],
            fields: [
                { id: "f:target", label: "Target", bind_id: "t:root" },
                {
                    id: "f:xToggle",
                    label: "XToggle",
                    bind_id: "t:X",
                    options: [{ id: "o:xHide", label: "Hide Target" }],
                },
            ],
            excludes_for_buttons: { "o:xHide": ["f:target"] },
        };

        const builder = mkBuilder(props);
        const sel = new Selection(builder, {
            env: "client",
            rootTagId: "t:root",
        });

        sel.replace("t:B");
        sel.add("o:xHide"); // from sibling branch

        const out = sel.visibleGroup();
        expect(out.kind).toBe("single");
        expect((out as any).group.fieldIds).toContain("f:xToggle");
    });

    it("button include/exclude conflict at same depth: exclude wins", () => {
        const props = {
            filters: [
                { id: "t:root", label: "Root" },
                { id: "t:A", label: "A", bind_id: "t:root" },
            ],
            fields: [
                { id: "f:target", label: "Target", bind_id: "t:root" },
                {
                    id: "f:inc",
                    label: "Inc",
                    bind_id: "t:A",
                    options: [{ id: "o:inc", label: "Include Target" }],
                },
                {
                    id: "f:exc",
                    label: "Exc",
                    bind_id: "t:A",
                    options: [{ id: "o:exc", label: "Exclude Target" }],
                },
            ],
            includes_for_buttons: { "o:inc": ["f:target"] },
            excludes_for_buttons: { "o:exc": ["f:target"] },
        };

        const builder = mkBuilder(props);
        const sel = new Selection(builder, {
            env: "client",
            rootTagId: "t:root",
        });

        sel.replace("t:A");
        sel.add("o:inc");
        sel.add("o:exc");

        const out = sel.visibleGroup();
        expect(out.kind).toBe("single");
        expect((out as any).group.fieldIds).not.toContain("f:target");
    });

    it("closest-depth button rule wins when a trigger has multiple binds", () => {
        const props = {
            filters: [
                { id: "t:root", label: "Root" },
                { id: "t:A", label: "A", bind_id: "t:root" },
                { id: "t:B", label: "B", bind_id: "t:A" },
            ],
            fields: [
                { id: "f:target", label: "Target", bind_id: "t:root" },
                {
                    id: "f:far",
                    label: "FarToggle",
                    bind_id: "t:A",
                    options: [{ id: "o:farHide", label: "Hide Target" }],
                },
                {
                    id: "f:close",
                    label: "CloseToggle",
                    bind_id: ["t:root", "t:B"],
                    options: [{ id: "o:closeShow", label: "Show Target" }],
                },
            ],
            excludes_for_buttons: { "o:farHide": ["f:target"] },
            includes_for_buttons: { "o:closeShow": ["f:target"] },
        };

        const builder = mkBuilder(props);
        const sel = new Selection(builder, {
            env: "client",
            rootTagId: "t:root",
        });

        sel.replace("t:B");
        sel.add("o:farHide");
        let out = sel.visibleGroup();
        expect(out.kind).toBe("single");
        expect((out as any).group.fieldIds).not.toContain("f:target");

        sel.add("o:closeShow");
        out = sel.visibleGroup();
        expect(out.kind).toBe("single");
        expect((out as any).group.fieldIds).toContain("f:target");
    });
});
