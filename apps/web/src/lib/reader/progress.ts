export type ReaderProgress = {
  /** Scroll ratio in [0, 1] relative to max scrollTop. */
  ratio: number;
  updatedAt: number;
};

const PREFIX = 'reader:progress:';

function key(documentId: string): string {
  return `${PREFIX}${documentId}`;
}

export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function computeScrollRatio(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const max = scrollHeight - clientHeight;
  if (max <= 0) return 0;
  return clampRatio(scrollTop / max);
}

export function ratioToScrollTop(
  ratio: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const max = scrollHeight - clientHeight;
  if (max <= 0) return 0;
  return clampRatio(ratio) * max;
}

export function loadReaderProgress(documentId: string): ReaderProgress | null {
  if (typeof window === 'undefined' || !documentId) return null;
  try {
    const raw = localStorage.getItem(key(documentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReaderProgress>;
    if (typeof parsed.ratio !== 'number') return null;
    return {
      ratio: clampRatio(parsed.ratio),
      updatedAt:
        typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveReaderProgress(
  documentId: string,
  ratio: number,
): ReaderProgress | null {
  if (typeof window === 'undefined' || !documentId) return null;
  const next: ReaderProgress = {
    ratio: clampRatio(ratio),
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(key(documentId), JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

export function clearReaderProgress(documentId: string): void {
  if (typeof window === 'undefined' || !documentId) return;
  try {
    localStorage.removeItem(key(documentId));
  } catch {
    /* ignore */
  }
}
