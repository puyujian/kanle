"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { DOMSerializer } from "@tiptap/pm/model";
import { Sparkles, X } from "lucide-react";
import AiResultDialog from "./AiResultDialog";
import { markdownToHtml } from "@/lib/markdown";
import { sanitizeHtml } from "@/lib/sanitize";
import { apiFetch } from "@/lib/api-fetch";
import { protectRichHtml, restoreProtectedHtml, streamAiGeneration, type AiMode } from "@/lib/ai-client";

type ArticleMode = Exclude<AiMode, "moment_polish">;

interface ArticleAiAssistantProps {
  editor: Editor | null;
  sourceMode: boolean;
  title: string;
  onTitleChange: (title: string) => void;
  open: boolean;
  onClose: () => void;
}

const MODES: Array<{ value: ArticleMode; label: string; help: string }> = [
  { value: "article_outline", label: "生成大纲", help: "根据主题设计文章结构" },
  { value: "article_continue", label: "续写", help: "基于选区或全文上下文继续写作" },
  { value: "article_polish", label: "润色", help: "优先润色选区，无选区则处理全文" },
  { value: "article_full", label: "完整文章", help: "生成标题和完整正文" },
];

function selectionHtml(editor: Editor): string {
  const fragment = editor.state.selection.content().content;
  const wrap = document.createElement("div");
  wrap.appendChild(DOMSerializer.fromSchema(editor.schema).serializeFragment(fragment));
  return wrap.innerHTML;
}

export default function ArticleAiAssistant({ editor, sourceMode, title, onTitleChange, open, onClose }: ArticleAiAssistantProps) {
  const [available, setAvailable] = useState(false);
  const [mode, setMode] = useState<ArticleMode>("article_outline");
  const [topic, setTopic] = useState("");
  const [requirements, setRequirements] = useState("");
  const [outlineApply, setOutlineApply] = useState<"insert" | "replace">("insert");
  const [resultOpen, setResultOpen] = useState(false);
  const [original, setOriginal] = useState<string | undefined>();
  const [result, setResult] = useState("");
  const [resultBody, setResultBody] = useState("");
  const [suggestedTitle, setSuggestedTitle] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const snapshotRef = useRef("");
  const selectionRef = useRef({ from: 0, to: 0, empty: true });
  const fragmentsRef = useRef<string[]>([]);

  useEffect(() => {
    apiFetch("/ai/status")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setAvailable(!!data?.available))
      .catch(() => setAvailable(false));
  }, []);

  if (!open) return null;

  const start = async () => {
    if (!editor || sourceMode) return;
    const { from, to, empty } = editor.state.selection;
    const wholeHtml = editor.getHTML();
    const selectedHtml = empty ? "" : selectionHtml(editor);
    let content = "";
    fragmentsRef.current = [];

    if (mode === "article_polish") {
      const protectedValue = protectRichHtml(empty ? wholeHtml : selectedHtml);
      content = protectedValue.text;
      fragmentsRef.current = protectedValue.fragments;
    } else if (mode === "article_continue") {
      content = protectRichHtml(empty ? wholeHtml : selectedHtml).text;
    }

    if (["article_continue", "article_polish"].includes(mode) && !content.trim()) {
      setError("请先输入或选择文章内容");
      return;
    }
    if (["article_outline", "article_full"].includes(mode) && !topic.trim() && !title.trim()) {
      setError("请填写主题，或先填写文章标题");
      return;
    }

    snapshotRef.current = wholeHtml;
    selectionRef.current = { from, to, empty };
    setOriginal(mode === "article_polish" || mode === "article_continue" ? content : undefined);
    setResult("");
    setResultBody("");
    setSuggestedTitle("");
    setError("");
    setResultOpen(true);
    setGenerating(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const done = await streamAiGeneration(
        { mode, content, title, topic: topic.trim(), requirements: requirements.trim() },
        { signal: controller.signal, onDelta: (delta) => setResult((prev) => prev + delta) }
      );
      setSuggestedTitle(done.title || "");
      setResultBody(done.body || "");
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError(err instanceof Error ? err.message : "AI 生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const apply = () => {
    if (!editor) return;
    if (editor.getHTML() !== snapshotRef.current) {
      setError("文章在生成期间已发生变化。为避免覆盖新内容，请重新生成");
      return;
    }
    try {
      const cleanMarkdownHtml = (value: string) => sanitizeHtml(markdownToHtml(value));
      const selection = selectionRef.current;
      if (mode === "article_full") {
        const body = resultBody || result.replace(/^#\s+.+\n+/, "");
        editor.commands.setContent(cleanMarkdownHtml(body));
        if (suggestedTitle && (!title.trim() || window.confirm(`AI 建议标题：${suggestedTitle}\n\n是否覆盖当前标题？`))) {
          onTitleChange(suggestedTitle);
        }
      } else if (mode === "article_outline") {
        const html = cleanMarkdownHtml(result);
        if (outlineApply === "replace") editor.commands.setContent(html);
        else editor.chain().focus().insertContentAt(selection.from, html).run();
      } else if (mode === "article_continue") {
        const html = cleanMarkdownHtml(result);
        const position = selection.empty ? selection.from : selection.to;
        editor.chain().focus().insertContentAt(position, html).run();
      } else {
        const html = sanitizeHtml(restoreProtectedHtml(result, fragmentsRef.current, markdownToHtml));
        if (selection.empty) editor.commands.setContent(html);
        else editor.chain().focus().insertContentAt({ from: selection.from, to: selection.to }, html).run();
      }
      setResultOpen(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "应用 AI 结果失败");
    }
  };

  return (
    <>
      {!resultOpen && (
        <div className="fixed inset-0 z-[350] flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl dark:bg-[#25252b]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100"><Sparkles className="h-5 w-5 text-violet-500" />AI 写作助手</h3>
              <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button>
            </div>
            {!available ? (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">AI 功能尚未启用或配置不完整，请先前往后台“AI 配置”。</div>
            ) : sourceMode ? (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">请先退出源码模式再使用 AI 写作。</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {MODES.map((item) => <button key={item.value} type="button" title={item.help} onClick={() => setMode(item.value)} className={`rounded-lg px-3 py-2 text-sm ${mode === item.value ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{item.label}</button>)}
                </div>
                {["article_outline", "article_full"].includes(mode) && <label className="block"><span className="mb-1 block text-xs text-gray-500">文章主题</span><input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} placeholder="例如：在忙碌生活中保留独处时间" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none focus:border-violet-400 dark:border-white/10 dark:bg-white/5 dark:text-gray-100" /></label>}
                <label className="block"><span className="mb-1 block text-xs text-gray-500">写作要求（可选）</span><textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} maxLength={2000} rows={4} placeholder="语气、读者、篇幅、重点等" className="w-full resize-y rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none focus:border-violet-400 dark:border-white/10 dark:bg-white/5 dark:text-gray-100" /></label>
                {mode === "article_outline" && <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300"><span>应用方式</span><label><input type="radio" checked={outlineApply === "insert"} onChange={() => setOutlineApply("insert")} /> 插入光标处</label><label><input type="radio" checked={outlineApply === "replace"} onChange={() => setOutlineApply("replace")} /> 替换正文</label></div>}
                {error && <p className="text-sm text-red-500">{error}</p>}
                <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5">取消</button><button type="button" onClick={start} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"><Sparkles className="h-4 w-4" />开始生成</button></div>
              </div>
            )}
          </div>
        </div>
      )}
      <AiResultDialog
        open={resultOpen}
        title={MODES.find((item) => item.value === mode)?.label || "AI 写作"}
        original={original}
        result={result}
        generating={generating}
        error={error}
        onCancel={() => { controllerRef.current?.abort(); setResultOpen(false); onClose(); }}
        onStop={() => controllerRef.current?.abort()}
        onApply={apply}
        applyLabel={mode === "article_outline" && outlineApply === "insert" ? "插入大纲" : mode === "article_continue" ? "插入续写" : "应用结果"}
      />
    </>
  );
}
