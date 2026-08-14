"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  Loader2,
  MessageCircle,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { apiFetch, getToken } from "@/lib/api-fetch";
import { renderTextWithEmoji } from "@/lib/emoji";

type CommentStatus = "pending" | "draft" | "published" | "rejected";
type CommentSource = "visitor" | "admin" | "ai";

interface AiJob {
  id: string;
  type: "moderation" | "reply";
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  lastError: string;
}

interface AdminComment {
  id: string;
  author: string;
  email: string;
  website?: string;
  content: string;
  replyTo?: string;
  region?: string;
  status: CommentStatus;
  source: CommentSource;
  reviewMethod?: "human" | "ai" | null;
  reviewReason?: string;
  reviewedAt?: string | null;
  createdAt: string;
  aiJobs: AiJob[];
  post: { id: string; content: string; author: string } | null;
}

interface CommentResponse {
  counts: Record<"all" | CommentStatus, number>;
  data: AdminComment[];
}

const STATUS_META: Record<"all" | CommentStatus, { label: string; cls: string }> = {
  all: { label: "全部", cls: "bg-adm-input text-adm-text-secondary" },
  pending: { label: "待审核", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  draft: { label: "AI 草稿", cls: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  published: { label: "已发布", cls: "bg-green-500/10 text-green-600 dark:text-green-400" },
  rejected: { label: "已拒绝", cls: "bg-red-500/10 text-red-600 dark:text-red-400" },
};

function stripHtml(value: string): string {
  if (typeof document === "undefined") return value.replace(/<[^>]+>/g, " ");
  const node = document.createElement("div");
  node.innerHTML = value;
  return (node.textContent || "").replace(/\s+/g, " ").trim();
}

export default function AdminComments() {
  const [response, setResponse] = useState<CommentResponse>({
    counts: { all: 0, pending: 0, draft: 0, published: 0, rejected: 0 },
    data: [],
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | CommentStatus>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ author: "", email: "", website: "", content: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/admin/comments");
      if (!res.ok) throw new Error("加载评论失败");
      const data = await res.json();
      setResponse({
        counts: data.counts || { all: 0, pending: 0, draft: 0, published: 0, rejected: 0 },
        data: Array.isArray(data.data) ? data.data : [],
      });
      setSelected(new Set());
    } catch (error) {
      alert(error instanceof Error ? error.message : "加载评论失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) return;

    void load();
  }, [load]);

  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return response.data.filter((comment) => {
      if (filter !== "all" && comment.status !== filter) return false;
      if (!keyword) return true;
      return [comment.author, comment.email, comment.content, comment.post?.content || ""]
        .some((value) => value.toLowerCase().includes(keyword));
    });
  }, [filter, response.data, search]);

  const allVisibleSelected = visible.length > 0 && visible.every((comment) => selected.has(comment.id));

  const runBulk = async (action: "approve" | "reject" | "delete", ids = [...selected]) => {
    if (!ids.length || busy) return;
    const message = action === "delete"
      ? "确定永久删除所选评论吗？其下所有回复也会一并删除。"
      : action === "approve" ? "确定通过所选评论吗？" : "确定拒绝所选评论吗？";
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      const res = await apiFetch("/admin/comments/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "操作失败");
      if (data.skipped) alert(`操作完成，${data.skipped} 条因状态不适用或不存在而跳过。`);
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const retryAi = async (comment: AdminComment, job: AiJob) => {
    setBusy(true);
    try {
      const res = await apiFetch(`/admin/comments/${comment.id}/ai-retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: job.type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "重试失败");
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "重试失败");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (comment: AdminComment) => {
    setEditingId(comment.id);
    setEditForm({
      author: comment.author,
      email: comment.email,
      website: comment.website || "",
      content: comment.content,
    });
  };

  const saveEdit = async () => {
    if (!editingId || !editForm.author.trim() || !editForm.email.trim() || !editForm.content.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/admin/comments/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "保存失败");
      setEditingId(null);
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-adm-text">评论管理</h2>
        <p className="mt-1 text-sm text-adm-text-secondary">审核访客评论与 AI 回复草稿，共 {response.counts.all} 条</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(Object.keys(STATUS_META) as Array<"all" | CommentStatus>).map((status) => (
          <button
            key={status}
            onClick={() => { setFilter(status); setSelected(new Set()); }}
            className={`whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${filter === status ? "border-adm-primary bg-adm-primary/10 text-adm-primary" : "border-adm-border bg-adm-card text-adm-text-secondary"}`}
          >
            {STATUS_META[status].label} {response.counts[status] || 0}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adm-text-tertiary" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索昵称、邮箱、评论或原文…" className="w-full rounded-xl border border-adm-border bg-adm-card py-2.5 pl-10 pr-3 text-sm text-adm-text outline-none focus:border-adm-primary" />
        </div>
        <button onClick={() => void load()} className="flex items-center justify-center gap-1.5 rounded-xl border border-adm-border bg-adm-card px-3 py-2 text-sm text-adm-text-secondary hover:bg-adm-card-hover">
          <RefreshCw className="h-4 w-4" />刷新
        </button>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-adm-border bg-adm-card p-3">
          <span className="mr-auto text-sm text-adm-text-secondary">已选择 {selected.size} 条</span>
          <ActionButton icon={<Check className="h-4 w-4" />} label="批量通过" onClick={() => void runBulk("approve")} disabled={busy} />
          <ActionButton icon={<X className="h-4 w-4" />} label="批量拒绝" onClick={() => void runBulk("reject")} disabled={busy} />
          <ActionButton danger icon={<Trash2 className="h-4 w-4" />} label="批量删除" onClick={() => void runBulk("delete")} disabled={busy} />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-adm-text-tertiary" /></div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-adm-border bg-adm-card py-16 text-center">
          <MessageCircle className="mx-auto mb-2 h-8 w-8 text-adm-text-tertiary" />
          <p className="text-sm text-adm-text-tertiary">暂无符合条件的评论</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-adm-border bg-adm-card">
          <label className="flex items-center gap-2 border-b border-adm-border px-4 py-3 text-xs text-adm-text-secondary">
            <input type="checkbox" checked={allVisibleSelected} onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((comment) => comment.id)))} className="accent-adm-primary" />
            全选当前筛选结果
          </label>
          <div className="divide-y divide-adm-border">
            {visible.map((comment) => {
              const failedJobs = comment.aiJobs.filter((job) => job.status === "failed");
              const activeJob = comment.aiJobs.find((job) => job.status === "queued" || job.status === "running");
              return (
                <article key={comment.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selected.has(comment.id)} onChange={() => setSelected((previous) => { const next = new Set(previous); if (next.has(comment.id)) next.delete(comment.id); else next.add(comment.id); return next; })} className="mt-1 accent-adm-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-adm-text">{comment.author}</span>
                        <span className="text-xs text-adm-text-tertiary">{comment.email}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[11px] ${STATUS_META[comment.status].cls}`}>{STATUS_META[comment.status].label}</span>
                        <span className="flex items-center gap-1 rounded bg-adm-input px-1.5 py-0.5 text-[11px] text-adm-text-secondary">
                          {comment.source === "ai" ? <Bot className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
                          {comment.source === "ai" ? "AI" : comment.source === "admin" ? "管理员" : "访客"}
                        </span>
                        {activeJob && <span className="flex items-center gap-1 text-[11px] text-violet-500"><Loader2 className="h-3 w-3 animate-spin" />AI {activeJob.type === "moderation" ? "审核" : "回复"}中</span>}
                      </div>

                      {editingId === comment.id ? (
                        <div className="mt-3 space-y-2 rounded-xl bg-adm-input p-3">
                          <div className="grid gap-2 sm:grid-cols-3">
                            <input value={editForm.author} onChange={(event) => setEditForm({ ...editForm, author: event.target.value })} placeholder="昵称" className="comment-admin-input" />
                            <input value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} placeholder="邮箱" className="comment-admin-input" />
                            <input value={editForm.website} onChange={(event) => setEditForm({ ...editForm, website: event.target.value })} placeholder="网站" className="comment-admin-input" />
                          </div>
                          <textarea value={editForm.content} onChange={(event) => setEditForm({ ...editForm, content: event.target.value })} rows={4} className="comment-admin-input resize-y" />
                          <div className="flex gap-2">
                            <ActionButton icon={<Save className="h-4 w-4" />} label="保存" onClick={() => void saveEdit()} disabled={busy} />
                            <ActionButton icon={<X className="h-4 w-4" />} label="取消" onClick={() => setEditingId(null)} disabled={busy} />
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 text-sm leading-6 text-adm-text-secondary" dangerouslySetInnerHTML={{ __html: renderTextWithEmoji(comment.content) }} />
                      )}

                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-adm-text-tertiary">
                        <span>{new Date(comment.createdAt).toLocaleString("zh-CN")}</span>
                        {comment.region && <span>{comment.region}</span>}
                        {comment.replyTo && <span>回复 {comment.replyTo}</span>}
                        {comment.post && <span className="max-w-full truncate">来自：{comment.post.author} · {stripHtml(comment.post.content).slice(0, 50)}</span>}
                      </div>
                      {comment.reviewReason && <p className="mt-2 rounded-lg bg-adm-input px-3 py-2 text-xs text-adm-text-secondary">审核意见：{comment.reviewReason}</p>}
                      {failedJobs.map((job) => (
                        <div key={job.id} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-red-500/5 px-3 py-2 text-xs text-red-500">
                          <span>AI {job.type === "moderation" ? "审核" : "回复"}失败：{job.lastError || "未知错误"}</span>
                          <button disabled={busy} onClick={() => void retryAi(comment, job)} className="flex items-center gap-1 font-medium hover:underline"><RefreshCw className="h-3 w-3" />重试</button>
                        </div>
                      ))}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {["pending", "draft", "rejected"].includes(comment.status) && <ActionButton icon={<Check className="h-4 w-4" />} label="通过" onClick={() => void runBulk("approve", [comment.id])} disabled={busy} />}
                        {["pending", "draft"].includes(comment.status) && <ActionButton icon={<X className="h-4 w-4" />} label="拒绝" onClick={() => void runBulk("reject", [comment.id])} disabled={busy} />}
                        <ActionButton icon={<Pencil className="h-4 w-4" />} label="编辑" onClick={() => startEdit(comment)} disabled={busy} />
                        <ActionButton danger icon={<Trash2 className="h-4 w-4" />} label="删除" onClick={() => void runBulk("delete", [comment.id])} disabled={busy} />
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
      <style jsx global>{`.comment-admin-input{width:100%;border-radius:.5rem;border:1px solid var(--adm-border);background:var(--adm-card);padding:.55rem .7rem;font-size:.875rem;color:var(--adm-text);outline:none}.comment-admin-input:focus{border-color:var(--adm-primary)}`}</style>
    </div>
  );
}

function ActionButton({ icon, label, onClick, disabled, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-50 ${danger ? "bg-adm-danger-bg text-adm-danger" : "bg-adm-card-hover text-adm-text-secondary hover:text-adm-text"}`}>
      {icon}{label}
    </button>
  );
}
