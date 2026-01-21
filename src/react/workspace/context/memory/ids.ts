// src/react/workspace/context/backend/memory/ids.ts

let __seq: number = 0;

function nextSeq(): number {
    __seq += 1;
    return __seq;
}

export function newId(prefix: string): string {
    // stable-enough for memory usage; predictable in tests if you reset module state
    const t: string = Date.now().toString(36);
    const s: string = nextSeq().toString(36);
    return `${prefix}_${t}_${s}`;
}

export function newBranchId(): string {
    return newId("br");
}

export function newAuthorId(): string {
    return newId("au");
}

export function newTemplateId(): string {
    return newId("tpl");
}

export function newTemplateKey(): string {
    return `tpl_${Date.now().toString(36)}_${nextSeq().toString(36)}`;
}

export function newDraftId(): string {
    return newId("dr");
}

export function newCommitId(): string {
    return newId("cm");
}

export function newThreadId(): string {
    return newId("th");
}

export function newMessageId(): string {
    return newId("msg");
}

export function bumpEtag(prev?: string): string {
    const n: number = (prev ? parseInt(prev, 10) : 0) + 1;
    return String(Number.isFinite(n) ? n : 1);
}
