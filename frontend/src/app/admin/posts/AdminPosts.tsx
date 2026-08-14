"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Trash2,
  Pin,
  PinOff,
  Heart,
  MessageSquare,
  Loader2,
  Bot,
  RefreshCw,
} from "lucide-react";
import { apiFetch, getToken } from "@/lib/api-fetch";
import { Post } from "@/lib/mock-data";
import PostCard from "@/components/PostCard";
import { PostCardSkeleton } from "@/components/Skeleton";
import { useSiteSettings } from "@/lib/site-settings-store";

function formatAiJob(job: NonNullable<Post["aiCommentJob"]>): string {
  if (job.status === "queued") return "AI 首评排队中";
  if (job.status === "running") return "AI 首评生成中";
  if (job.status === "failed") return `AI 首评失败${job.lastError ? `：${job.lastError}` : ""}`;
  if (job.status === "skipped") return `AI 首评已跳过${job.lastError ? `：${job.lastError}` : ""}`;
  if (job.fallbackReason) return `AI 首评已${job.publishMode === "draft" ? "存为草稿" : "发布"}（视觉已降级）`;
  return job.publishMode === "draft" ? "AI 首评草稿已生成" : "AI 首评已发布";
}

export default function AdminPosts() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [permId, setPermId] = useState<string | null>(null);
  const [aiJobs, setAiJobs] = useState<Record<string, NonNullable<Post["aiCommentJob"]>>>({});
  const [retryingAiId, setRetryingAiId] = useState<string | null>(null);

  const token = getToken();
  const fetchSettings = useSiteSettings((s) => s.fetchSettings);

  const fetchPosts = () => {
    if (!token) return;
    setLoading(true);
    apiFetch("/posts?limit=100")
      .then((res) => res.json())
      .then((data) => {
        setPosts(data.data || []);
      })
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
    apiFetch("/admin/post-ai-comments")
      .then((res) => res.json())
      .then((data) => setAiJobs(Object.fromEntries((data.data || []).map((job: NonNullable<Post["aiCommentJob"]> & { postId: string }) => [job.postId, job]))))
      .catch(() => setAiJobs({}));
  };

  const retryAiComment = async (postId: string) => {
    setRetryingAiId(postId);
    try {
      const res = await apiFetch(`/admin/posts/${postId}/ai-comment-retry`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "重试失败");
      fetchPosts();
    } catch (error) {
      alert(error instanceof Error ? error.message : "重试失败");
    } finally {
      setRetryingAiId(null);
    }
  };

  useEffect(() => {
    if (!token) {
      router.replace("/");
      return;
    }
    fetchPosts();
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, token]);

  const handleDelete = async (id: string) => {
    if (!token || !confirm("确定删除这条动态吗？")) return;
    setDeletingId(id);
    try {
      const res = await apiFetch(`/posts/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== id));
      } else {
        alert("删除失败");
      }
    } catch {
      alert("网络错误");
    } finally {
      setDeletingId(null);
    }
  };

  const handlePin = async (id: string, currentPinned: boolean) => {
    if (!token) return;
    setPinningId(id);
    try {
      const res = await apiFetch(`/posts/${id}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !currentPinned }),
      });
      if (res.ok) {
        const data = await res.json();
        setPosts((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, pinned: !!data.pinned } : p,
          ),
        );
      } else {
        alert("操作失败");
      }
    } catch {
      alert("网络错误");
    } finally {
      setPinningId(null);
    }
  };

  const handleTogglePermission = async (
    id: string,
    field: "likesDisabled" | "commentsDisabled",
    current: boolean,
  ) => {
    if (!token) return;
    setPermId(`${id}:${field}`);
    try {
      const res = await apiFetch(`/posts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: !current }),
      });
      if (res.ok) {
        setPosts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, [field]: !current } : p))
        );
      } else {
        alert("操作失败");
      }
    } catch {
      alert("网络错误");
    } finally {
      setPermId(null);
    }
  };

  if (loading) {
    return (
      <div className="divide-hairline rounded-xl bg-white dark:bg-adm-card">
        {Array.from({ length: 4 }).map((_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-adm-text">动态管理</h2>
        <p className="mt-1 text-sm leading-5 text-adm-text-secondary">
          共 {posts.length} 条动态
          <span className="hidden sm:inline">
            （发布请使用顶栏「发表动态」按钮）
          </span>
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-adm-border bg-adm-card py-12 text-center">
          <p className="text-sm text-adm-text-tertiary">暂无动态</p>
        </div>
      ) : (
        <div className="gap-3 lg:columns-2">
          {posts.map((post, index) => (
            <div
              key={post.id}
              className="mb-3 break-inside-avoid overflow-hidden rounded-xl border border-adm-border bg-adm-card sm:rounded-2xl"
            >
              <div className="[&>article]:px-3 [&>article]:py-3 sm:[&>article]:px-5 sm:[&>article]:py-4">
                <PostCard post={post} index={index} />
              </div>
              <ActionBar
                post={post}
                permId={permId}
                pinningId={pinningId}
                deletingId={deletingId}
                onDelete={handleDelete}
                onPin={handlePin}
                onTogglePerm={handleTogglePermission}
                aiJob={aiJobs[post.id] || null}
                retryingAi={retryingAiId === post.id}
                onRetryAi={retryAiComment}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Admin action bar */
function ActionBar({
  post,
  permId,
  pinningId,
  deletingId,
  onDelete,
  onPin,
  onTogglePerm,
  aiJob,
  retryingAi,
  onRetryAi,
}: {
  post: Post;
  permId: string | null;
  pinningId: string | null;
  deletingId: string | null;
  onDelete: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onTogglePerm: (
    id: string,
    field: "likesDisabled" | "commentsDisabled",
    current: boolean,
  ) => void;
  aiJob: Post["aiCommentJob"];
  retryingAi: boolean;
  onRetryAi: (id: string) => void;
}) {
  const permissionBusy = permId?.startsWith(`${post.id}:`) ?? false;
  const likeBusy = permId === `${post.id}:likesDisabled`;
  const commentBusy = permId === `${post.id}:commentsDisabled`;
  const pinBusy = pinningId === post.id;
  const deleteBusy = deletingId === post.id;
  const baseButton =
    "flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors disabled:cursor-wait disabled:opacity-50 sm:px-3 sm:py-1.5";

  return (
    <div className="grid grid-cols-2 gap-1.5 border-t border-adm-border bg-adm-card-hover/40 p-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-2 sm:px-4 sm:py-2.5">
      {aiJob && (
        <div className="col-span-2 flex min-w-0 items-center gap-1.5 text-xs text-adm-text-tertiary sm:mr-auto">
          {aiJob.status === "running" || aiJob.status === "queued" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" /> : <Bot className="h-3.5 w-3.5 text-violet-500" />}
          <span className="truncate">{formatAiJob(aiJob)}</span>
          {["failed", "skipped"].includes(aiJob.status) && <button type="button" disabled={retryingAi} onClick={() => onRetryAi(post.id)} title={aiJob.lastError || "重试 AI 首评"} className="ml-1 rounded p-1 text-violet-500 hover:bg-violet-500/10 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${retryingAi ? "animate-spin" : ""}`} /></button>}
        </div>
      )}
      <button
        type="button"
        onClick={() => onTogglePerm(post.id, "likesDisabled", !!post.likesDisabled)}
        disabled={permissionBusy}
        title={post.likesDisabled ? "已关闭点赞，点击开启" : "允许点赞，点击关闭"}
        className={`${baseButton} ${
          post.likesDisabled
            ? "bg-adm-danger-bg text-adm-danger"
            : "bg-adm-card text-adm-text-secondary hover:bg-adm-card-hover sm:bg-transparent"
        }`}
      >
        {likeBusy ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <Heart className="h-3.5 w-3.5 shrink-0" />
        )}
        {post.likesDisabled ? "点赞已关" : "允许点赞"}
      </button>
      <button
        type="button"
        onClick={() => onTogglePerm(post.id, "commentsDisabled", !!post.commentsDisabled)}
        disabled={permissionBusy}
        title={post.commentsDisabled ? "已关闭评论，点击开启" : "允许评论，点击关闭"}
        className={`${baseButton} ${
          post.commentsDisabled
            ? "bg-adm-danger-bg text-adm-danger"
            : "bg-adm-card text-adm-text-secondary hover:bg-adm-card-hover sm:bg-transparent"
        }`}
      >
        {commentBusy ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
        )}
        {post.commentsDisabled ? "评论已关" : "允许评论"}
      </button>
      <div className="mx-1 hidden h-4 w-px bg-adm-border sm:block" />
      {!post.isAd && (
        <button
          type="button"
          onClick={() => onPin(post.id, !!post.pinned)}
          disabled={pinBusy}
          className={`${baseButton} bg-adm-card text-adm-text-secondary hover:bg-adm-card-hover sm:bg-transparent`}
        >
          {pinBusy ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : post.pinned ? (
            <PinOff className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Pin className="h-3.5 w-3.5 shrink-0" />
          )}
          {pinBusy ? "处理中" : post.pinned ? "取消置顶" : "置顶动态"}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDelete(post.id)}
        disabled={deleteBusy}
        className={`${baseButton} bg-adm-card text-adm-danger hover:bg-adm-danger-bg sm:bg-transparent ${
          post.isAd ? "col-span-2" : ""
        }`}
      >
        {deleteBusy ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5 shrink-0" />
        )}
        {deleteBusy ? "删除中" : "删除动态"}
      </button>
    </div>
  );
}
