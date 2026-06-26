// src/react/canvas/__tests__/selection.test.ts
import { describe, expect, it } from "vitest";

import { createBuilder } from "@/core";
import { Selection } from "../selection";

function mkBuilder(props: any) {
    const b = createBuilder({});
    b.load(props);
    return b;
}

describe("Selection button helpers", () => {
    it("selectedButtons(): returns only trigger keys (button-fields + options), excluding tags/non-button fields", () => {
        const props = {
            filters: [{ id: "t:root", label: "Root" }],
            fields: [
                {
                    id: "f:dripfeed",
                    label: "Enable drip-feed",
                    bind_id: "t:root",
                    button: true,
                },
                {
                    id: "f:mode",
                    label: "Mode",
                    bind_id: "t:root",
                    // not a button field
                    options: [{ id: "o:fast" }, { id: "o:slow" }],
                },
                {
                    id: "f:plain",
                    label: "Plain",
                    bind_id: "t:root",
                },
            ],
            schema_version: "jap.service-props.v1",
        };

        const builder = mkBuilder(props);
        const sel = new Selection(builder, {
            env: "client",
            rootTagId: "t:root",
        });

        // noise
        sel.replace("t:root"); // tag selection
        sel.add("f:plain"); // non-button field (should be ignored)

        // triggers
        sel.add("f:dripfeed"); // button-field trigger
        sel.add("o:fast"); // option trigger
        sel.add("o:slow"); // option trigger

        expect(sel.selectedButtons()).toEqual([
            "f:dripfeed",
            "o:fast",
            "o:slow",
        ]);
    });

    it("buttonSelectionsByFieldId(): groups trigger keys under the owning fieldId (button-field under itself; option under option owner)", () => {
        const props = {
            filters: [{ id: "t:root", label: "Root" }],
            fields: [
                {
                    id: "f:dripfeed",
                    label: "Enable drip-feed",
                    bind_id: "t:root",
                    button: true,
                },
                {
                    id: "f:mode",
                    label: "Mode",
                    bind_id: "t:root",
                    options: [{ id: "o:fast" }, { id: "o:slow" }],
                },
                {
                    id: "f:plain",
                    label: "Plain",
                    bind_id: "t:root",
                },
            ],
            schema_version: "jap.service-props.v1",
        };

        const builder = mkBuilder(props);
        const sel = new Selection(builder, {
            env: "client",
            rootTagId: "t:root",
        });

        // tag + non-button field should not appear in output
        sel.replace("t:root");
        sel.add("f:plain");

        // triggers
        sel.add("f:dripfeed"); // button-field trigger => groups under f:dripfeed
        sel.add("o:fast"); // option trigger => groups under f:mode
        sel.add("o:slow"); // option trigger => groups under f:mode

        expect(sel.buttonSelectionsByFieldId()).toEqual({
            "f:dripfeed": ["f:dripfeed"],
            "f:mode": ["o:fast", "o:slow"],
        });
    });
});
