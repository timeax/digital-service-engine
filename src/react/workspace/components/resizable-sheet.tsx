import * as React from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import clsx from "clsx";

export interface ResizableSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Optional storage key to persist height between sessions. */
    storageKey?: string;
    /** Initial height in px (if no stored height found). Defaults to 40% of viewport height. */
    initialHeightPx?: number;
    /** Minimum height in px. Default: 240. */
    minHeightPx?: number;
    /** Maximum height in px (absolute). Default: 90% of viewport height. */
    maxHeightPx?: number;
    /** Optional className for SheetContent. */
    className?: string;
    /** Optional aria-label for the content region. */
    ariaLabel?: string;
    children: React.ReactNode;
}

const DEFAULT_MIN = 240;

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

export const ResizableSheet: React.FC<ResizableSheetProps> = ({
                                                                  open,
                                                                  onOpenChange,
                                                                  storageKey,
                                                                  initialHeightPx,
                                                                  minHeightPx = DEFAULT_MIN,
                                                                  maxHeightPx,
                                                                  className,
                                                                  ariaLabel = "Bottom drawer",
                                                                  children,
                                                              }) => {
    const contentRef = React.useRef<HTMLDivElement | null>(null);
    const [viewportH, setViewportH] = React.useState<number>(
        typeof window !== "undefined" ? window.innerHeight : 0,
    );

    // Compute default max from viewport (90vh)
    const computedMax: number = React.useMemo(() => {
        const vh = viewportH || 0;
        const ninety = Math.round(vh * 0.9);
        return typeof maxHeightPx === "number"
            ? Math.min(maxHeightPx, ninety)
            : ninety;
    }, [viewportH, maxHeightPx]);

    // Initial height: storage → prop → 40% vh
    const defaultInitial: number = React.useMemo(() => {
        if (typeof window !== "undefined" && storageKey) {
            const raw: string | null = window.localStorage.getItem(storageKey);
            const parsed: number = raw ? parseInt(raw, 10) : NaN;
            if (!Number.isNaN(parsed) && parsed > 0) return parsed;
        }
        if (typeof initialHeightPx === "number" && initialHeightPx > 0)
            return initialHeightPx;
        return Math.max(minHeightPx, Math.round((viewportH || 0) * 0.4));
    }, [storageKey, initialHeightPx, minHeightPx, viewportH]);

    const [heightPx, setHeightPx] = React.useState<number>(defaultInitial);

    // Keep height clamped to bounds and persist when it changes
    React.useEffect(() => {
        const clamped: number = clamp(heightPx, minHeightPx, computedMax);
        if (clamped !== heightPx) setHeightPx(clamped);
        if (storageKey && clamped > 0) {
            window.localStorage.setItem(storageKey, String(clamped));
        }
    }, [heightPx, minHeightPx, computedMax, storageKey]);

    // Track viewport height for max-height recalculation
    React.useEffect(() => {
        const onResize = (): void => setViewportH(window.innerHeight);
        window.addEventListener("resize", onResize, { passive: true });
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // Drag logic for top edge
    const dragStateRef = React.useRef<{
        startY: number;
        startHeight: number;
        dragging: boolean;
    } | null>(null);

    const onMouseMove = React.useCallback(
        (e: MouseEvent): void => {
            const ds = dragStateRef.current;
            if (!ds) return;
            const dy: number = ds.startY - e.clientY; // dragging upward => positive dy => increase height
            const next: number = clamp(
                ds.startHeight + dy,
                minHeightPx,
                computedMax,
            );
            setHeightPx(next);
        },
        [minHeightPx, computedMax],
    );

    const endDrag = React.useCallback((): void => {
        dragStateRef.current = null;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", endDrag);
        // allow text selection again if you disabled it via a class (not applied here)
    }, [onMouseMove]);

    const beginDrag = React.useCallback(
        (e: React.MouseEvent<HTMLDivElement, MouseEvent>): void => {
            if (e.button !== 0) return; // primary only
            dragStateRef.current = {
                startY: e.clientY,
                startHeight: heightPx,
                dragging: true,
            };
            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", endDrag);
            e.preventDefault();
            e.stopPropagation();
        },
        [heightPx, onMouseMove, endDrag],
    );

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            {/* Note: shadcn Sheet renders an overlay for us */}
            <SheetContent
                ref={contentRef}
                side="bottom"
                aria-label={ariaLabel}
                className={clsx(
                    "p-0 border-t relative", // relative: needed for absolute drag edge
                    // Optional: smooth height transitions when not dragging
                    "transition-[height] duration-200 ease-in-out",
                    className,
                )}
                // Inline style height rules (style wins over class utilities)
                style={{
                    height: `${clamp(heightPx, minHeightPx, computedMax)}px`,
                    maxHeight: `${computedMax}px`,
                    minHeight: `${minHeightPx}px`,
                    width: "100vw",
                }}
            >
                {/* Invisible draggable top edge */}
                <div
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="Resize drawer"
                    onMouseDown={beginDrag}
                    className="absolute -top-1 left-0 right-0 h-2 cursor-row-resize z-50"
                    style={{
                        /* keep it invisible but easy to hit */ background:
                            "transparent",
                    }}
                />
                {/* Optional visible affordance (very subtle): uncomment if you want a hairline */}
                {/* <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-muted-foreground/30 mt-1" /> */}

                {/* Drawer content area */}
                <div className="h-full w-full overflow-hidden">{children}</div>
            </SheetContent>
        </Sheet>
    );
};
