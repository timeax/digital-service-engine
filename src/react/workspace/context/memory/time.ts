// src/react/workspace/context/backend/memory/time.ts

export function nowMs(): number {
    return Date.now();
}

export function isoNow(): string {
    return new Date().toISOString();
}

export function toIso(input?: string | number | Date): string {
    if (!input) return isoNow();
    if (typeof input === "string") return input;
    if (typeof input === "number") return new Date(input).toISOString();
    return input.toISOString();
}
