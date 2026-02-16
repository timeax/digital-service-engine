import { describe, it, expect } from "vitest";
import * as React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";

import { FormProvider, useFormApi, useFormSelections } from "@/react";

function mount(ui: React.ReactElement) {
    const host = document.createElement("div");
    document.body.appendChild(host);

    let root: Root | null = null;
    act(() => {
        root = createRoot(host);
        root!.render(ui);
    });

    return {
        unmount() {
            act(() => root?.unmount());
            host.remove();
        },
    };
}

describe("FormProvider (CoinMarketCap props) – selections publish", () => {
    it("toggleSelection(f:dripfeed, on/off) publishes and stores selection ids", () => {
        let api: ReturnType<typeof useFormApi> | null = null;

        function Capture() {
            api = useFormApi();
            return null;
        }

        const app = mount(
            <FormProvider>
                <Capture />
            </FormProvider>,
        );

        expect(api).toBeTruthy();

        let hits = 0;
        const unsub = api!.subscribe(() => hits++);

        act(() => api!.toggleSelection("f:dripfeed", "on"));
        expect(hits).toBe(1);
        expect(api!.getSelections("f:dripfeed")).toEqual(["on"]);

        act(() => api!.toggleSelection("f:dripfeed", "on"));
        expect(hits).toBe(2);
        expect(api!.getSelections("f:dripfeed")).toEqual([]);

        unsub();
        app.unmount();
    });

    it("useFormSelections('f:dripfeed') re-renders when the selection changes", () => {
        let api: ReturnType<typeof useFormApi> | null = null;
        const renders: string[][] = [];

        function Capture() {
            api = useFormApi();
            return null;
        }

        function Watch() {
            const s = useFormSelections("f:dripfeed");
            renders.push(s.selected.slice());
            return null;
        }

        const app = mount(
            <FormProvider>
                <Capture />
                <Watch />
            </FormProvider>,
        );

        expect(api).toBeTruthy();

        act(() => api!.toggleSelection("f:dripfeed", "on"));
        act(() => api!.toggleSelection("f:dripfeed", "on"));

        //@ts-ignore
        expect(renders.at(-1)).toEqual([]);
        app.unmount();
    });
});
