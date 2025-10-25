// noinspection DuplicatedCode

import * as React from "react";
import type { JSX } from "react";

export type BottomBarMode = "default" | "select" | "fallback" | (string & {});

export interface BottomBarState {
    readonly isOpen: boolean;
    readonly mode: BottomBarMode;
    readonly heightPx: number;
    readonly minHeightPx: number;
    readonly maxHeightPx: number;
}

export interface BottomBarAPI {
    setOpen(next: boolean): void;
    toggle(): void;

    setMode(mode: BottomBarMode): void;

    setHeight(px: number): void;
    clampHeight(px: number): number;
}

export interface BottomBarContextValue extends BottomBarState, BottomBarAPI {}

const BottomBarCtx = React.createContext<BottomBarContextValue | null>(null);

export function useBottomBar(): BottomBarContextValue {
    const ctx = React.useContext(BottomBarCtx);
    if (!ctx)
        throw new Error(
            "useBottomBar() must be used within <BottomBarProvider>.",
        );
    return ctx;
}

export interface BottomBarProviderProps {
    children: React.ReactNode;

    /** Persist isOpen + height in localStorage under this key (optional). */
    storageKey?: string;

    /** Initials when no storage is present. */
    initialIsOpen?: boolean; // default: false
    initialMode?: BottomBarMode; // default: "default"
    initialHeightPx?: number; // default: 40% of viewport

    /** Bounds (px). Defaults: min=240, max=90vh (computed). */
    minHeightPx?: number;
    maxHeightPx?: number; // absolute cap; if omitted, 90vh is used

    /** Keyboard shortcuts (all optional) */
    enableHotkeys?: boolean; // default: true
    /** Toggle shortcut config (default: Ctrl/Cmd + J) */
    hotkeyToggleKey?: string; // default: "j" (case-insensitive)
    hotkeyToggleCtrlOrMeta?: boolean; // default: true  (require Ctrl or Cmd)
    hotkeyToggleAlt?: boolean; // default: false (require Alt)
    hotkeyToggleShift?: boolean; // default: false (require Shift)
    /** Close with Escape when open (default: true) */
    closeOnEscape?: boolean;
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

function isEditableTarget(t: EventTarget | null): boolean {
    if (!(t instanceof HTMLElement)) return false;
    const tag = t.tagName;
    if (t.isContentEditable) return true;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function BottomBarProvider({
    children,
    storageKey,
    initialIsOpen = false,
    initialMode = "default",
    initialHeightPx,
    minHeightPx = 240,
    maxHeightPx,

    // hotkeys
    enableHotkeys = true,
    hotkeyToggleKey = "j",
    hotkeyToggleCtrlOrMeta = true,
    hotkeyToggleAlt = false,
    hotkeyToggleShift = false,
    closeOnEscape = true,
}: BottomBarProviderProps): JSX.Element {
    const [vh, setVh] = React.useState<number>(
        typeof window !== "undefined" ? window.innerHeight : 800,
    );

    React.useEffect(() => {
        const onResize = (): void => setVh(window.innerHeight);
        window.addEventListener("resize", onResize, { passive: true });
        return () => window.removeEventListener("resize", onResize);
    }, []);

    const computedMax: number = React.useMemo(() => {
        const ninety = Math.round(vh * 0.9);
        return typeof maxHeightPx === "number"
            ? Math.min(maxHeightPx, ninety)
            : ninety;
    }, [vh, maxHeightPx]);

    // Load from storage if available
    const readStorage = React.useCallback(() => {
        if (!storageKey || typeof window === "undefined") {
            return { isOpen: initialIsOpen, heightPx: initialHeightPx };
        }
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return { isOpen: initialIsOpen, heightPx: initialHeightPx };
        try {
            const parsed = JSON.parse(raw) as {
                isOpen?: boolean;
                heightPx?: number;
            } | null;
            return {
                isOpen:
                    typeof parsed?.isOpen === "boolean"
                        ? parsed.isOpen!
                        : initialIsOpen,
                heightPx:
                    typeof parsed?.heightPx === "number"
                        ? parsed.heightPx!
                        : initialHeightPx,
            };
        } catch {
            return { isOpen: initialIsOpen, heightPx: initialHeightPx };
        }
    }, [storageKey, initialIsOpen, initialHeightPx]);

    const writeStorage = React.useCallback(
        (isOpenVal: boolean, heightVal: number): void => {
            if (!storageKey || typeof window === "undefined") return;
            try {
                window.localStorage.setItem(
                    storageKey,
                    JSON.stringify({ isOpen: isOpenVal, heightPx: heightVal }),
                );
            } catch {
                /* no-op */
            }
        },
        [storageKey],
    );

    const seed = readStorage();

    const [isOpen, setOpenState] = React.useState<boolean>(!!seed.isOpen);
    const [mode, setModeState] = React.useState<BottomBarMode>(initialMode);

    const defaultHeight = React.useMemo(() => {
        if (typeof seed.heightPx === "number" && seed.heightPx > 0)
            return seed.heightPx;
        if (typeof initialHeightPx === "number" && initialHeightPx > 0)
            return initialHeightPx;
        return Math.max(minHeightPx, Math.round(vh * 0.4)); // 40vh default
    }, [seed.heightPx, initialHeightPx, minHeightPx, vh]);

    const [heightPx, setHeightPx] = React.useState<number>(defaultHeight);

    // Clamp + persist
    React.useEffect(() => {
        const clamped = clamp(heightPx, minHeightPx, computedMax);
        if (clamped !== heightPx) {
            setHeightPx(clamped);
            writeStorage(isOpen, clamped);
        } else {
            writeStorage(isOpen, heightPx);
        }
    }, [heightPx, minHeightPx, computedMax, isOpen, writeStorage]);

    const setOpen = React.useCallback((next: boolean): void => {
        setOpenState(next);
    }, []);

    const toggle = React.useCallback((): void => {
        setOpenState((v) => !v);
    }, []);

    const setMode = React.useCallback(
        (m: BottomBarMode): void => setModeState(m),
        [],
    );
    const setHeight = React.useCallback(
        (px: number): void => setHeightPx(clamp(px, minHeightPx, computedMax)),
        [minHeightPx, computedMax],
    );
    const clampHeight = React.useCallback(
        (px: number): number => clamp(px, minHeightPx, computedMax),
        [minHeightPx, computedMax],
    );

    // --- Keyboard shortcuts ---
    React.useEffect(() => {
        if (!enableHotkeys) return;

        const handler = (e: KeyboardEvent): void => {
            if (isEditableTarget(e.target)) return;

            // Close on Escape
            if (closeOnEscape && e.key === "Escape" && isOpen) {
                e.preventDefault();
                setOpen(false);
                return;
            }

            // Toggle shortcut
            const keyOk = e.key.toLowerCase() === hotkeyToggleKey.toLowerCase();
            const ctrlMetaOk = hotkeyToggleCtrlOrMeta
                ? e.ctrlKey || e.metaKey
                : true;
            const altOk = hotkeyToggleAlt ? e.altKey : !e.altKey;
            const shiftOk = hotkeyToggleShift ? e.shiftKey : !e.shiftKey;

            if (keyOk && ctrlMetaOk && altOk && shiftOk) {
                e.preventDefault();
                setOpen(!isOpen);
            }
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [
        enableHotkeys,
        closeOnEscape,
        isOpen,
        setOpen,
        hotkeyToggleKey,
        hotkeyToggleCtrlOrMeta,
        hotkeyToggleAlt,
        hotkeyToggleShift,
    ]);

    const value = React.useMemo<BottomBarContextValue>(
        () => ({
            isOpen,
            mode,
            heightPx,
            minHeightPx,
            maxHeightPx: computedMax,

            setOpen,
            toggle,
            setMode,
            setHeight,
            clampHeight,
        }),
        [
            isOpen,
            mode,
            heightPx,
            minHeightPx,
            computedMax,
            setOpen,
            toggle,
            setMode,
            setHeight,
            clampHeight,
        ],
    );

    return (
        <BottomBarCtx.Provider value={value}>{children}</BottomBarCtx.Provider>
    );
}
