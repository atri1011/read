"use client";

import type { BilingualSegment, SegmentOrigin } from "@/lib/segments/types";

type Props = {
  segments: BilingualSegment[];
  disabled?: boolean;
  onChange: (next: BilingualSegment[]) => void;
};

const ORIGIN_LABEL: Record<SegmentOrigin, string> = {
  extracted: "提取",
  generated: "生成",
  edited: "已编辑",
};

export function SegmentEditor({ segments, disabled, onChange }: Props) {
  function updateAt(index: number, patch: Partial<BilingualSegment>) {
    const next = segments.map((seg, i) => {
      if (i !== index) return seg;
      const merged = { ...seg, ...patch };
      if (
        (patch.source !== undefined && patch.source !== seg.source) ||
        (patch.target !== undefined && patch.target !== seg.target)
      ) {
        merged.origin = "edited";
      }
      return merged;
    });
    onChange(next);
  }

  function removeAt(index: number) {
    onChange(segments.filter((_, i) => i !== index));
  }

  if (segments.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
        暂无句对。可重试解析，或切换到 Markdown 编辑。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {segments.map((seg, index) => (
        <div
          key={seg.id}
          className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-zinc-400">{seg.id}</span>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {ORIGIN_LABEL[seg.origin]}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeAt(index)}
                className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
              >
                删除
              </button>
            </div>
          </div>
          <label className="mb-2 block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              EN
            </span>
            <textarea
              value={seg.source}
              disabled={disabled}
              onChange={(e) => updateAt(index, { source: e.target.value })}
              rows={2}
              className="w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-900 outline-none ring-zinc-400 focus:ring-2 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              ZH
            </span>
            <textarea
              value={seg.target}
              disabled={disabled}
              onChange={(e) => updateAt(index, { target: e.target.value })}
              rows={2}
              className="w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-900 outline-none ring-zinc-400 focus:ring-2 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
        </div>
      ))}
    </div>
  );
}
