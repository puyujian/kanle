"use client";

import { Loader2, Sparkles, Square, X } from "lucide-react";

interface AiResultDialogProps {
  open: boolean;
  title: string;
  original?: string;
  result: string;
  generating: boolean;
  error?: string;
  onCancel: () => void;
  onStop: () => void;
  onApply: () => void;
  applyLabel?: string;
}

export default function AiResultDialog({
  open,
  title,
  original,
  result,
  generating,
  error,
  onCancel,
  onStop,
  onApply,
  applyLabel = "应用结果",
}: AiResultDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/45 p-4" onClick={onCancel}>
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#25252b]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-white/10">
          <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
            <Sparkles className="h-4 w-4 text-violet-500" /> {title}
          </div>
          <button type="button" onClick={onCancel} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <div className={`grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 ${original !== undefined ? "md:grid-cols-2" : ""}`}>
          {original !== undefined && (
            <section>
              <h4 className="mb-2 text-xs font-medium text-gray-500">原文</h4>
              <div className="min-h-52 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-7 text-gray-600 dark:bg-white/5 dark:text-gray-300">{original}</div>
            </section>
          )}
          <section>
            <h4 className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-500">
              AI 结果 {generating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </h4>
            <div className="min-h-52 whitespace-pre-wrap rounded-xl bg-violet-50/60 p-4 text-sm leading-7 text-gray-800 dark:bg-violet-500/10 dark:text-gray-100">
              {result || (generating ? "正在生成…" : "暂无结果")}
            </div>
          </section>
        </div>
        {error && <p className="px-5 pb-2 text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4 dark:border-white/10">
          <button type="button" onClick={generating ? onStop : onCancel} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5">
            {generating && <Square className="h-3.5 w-3.5" />} {generating ? "停止生成" : "取消"}
          </button>
          <button type="button" onClick={onApply} disabled={generating || !result || !!error} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40">
            {applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
