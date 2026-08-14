"use client";

import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, KeyRound, Loader2, RotateCcw, Save, Sparkles, TestTube2, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import type { AiMode } from "@/lib/ai-client";

type AiPromptMode = AiMode | "comment_reply" | "comment_moderation";

interface AiConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  commentReplyEnabled: boolean;
  commentReplyPublishMode: "draft" | "published";
  commentContextLimit: number;
  apiKeyConfigured: boolean;
  apiKeyMasked: string;
  encryptionReady: boolean;
  prompts: Record<AiPromptMode, string>;
  defaultPrompts: Record<AiPromptMode, string>;
}

const MODE_LABELS: Array<{ mode: AiPromptMode; label: string; help: string }> = [
  { mode: "moment_polish", label: "动态润色", help: "可用变量：{{content}}" },
  { mode: "article_outline", label: "文章大纲", help: "可用变量：{{topic}}、{{title}}、{{requirements}}" },
  { mode: "article_continue", label: "文章续写", help: "可用变量：{{content}}、{{title}}、{{requirements}}" },
  { mode: "article_polish", label: "文章润色", help: "可用变量：{{content}}、{{title}}、{{requirements}}" },
  { mode: "article_full", label: "完整文章", help: "可用变量：{{topic}}、{{title}}、{{requirements}}" },
  { mode: "comment_reply", label: "评论自动回复", help: "可用变量：{{postTitle}}、{{postContent}}、{{thread}}、{{author}}、{{comment}}" },
  { mode: "comment_moderation", label: "评论 AI 审核", help: "可用变量：{{postTitle}}、{{postContent}}、{{author}}、{{content}}" },
];

export default function AdminAiConfig() {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; model?: string; latencyMs?: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/ai/config")
      .then(async (res) => {
        if (!res.ok) throw new Error("加载 AI 配置失败");
        const data = await res.json();
        if (!cancelled) setConfig(data);
      })
      .catch((err) => alert(err instanceof Error ? err.message : "加载失败"));
    return () => { cancelled = true; };
  }, []);

  const save = async (clearApiKey = false) => {
    if (!config) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await apiFetch("/ai/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: config.enabled,
          baseUrl: config.baseUrl,
          model: config.model,
          temperature: Number(config.temperature),
          maxTokens: Number(config.maxTokens),
          commentReplyEnabled: config.commentReplyEnabled,
          commentReplyPublishMode: config.commentReplyPublishMode,
          commentContextLimit: Number(config.commentContextLimit),
          prompts: config.prompts,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          ...(clearApiKey ? { clearApiKey: true } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "保存失败");
      setConfig(data);
      setApiKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (apiKey.trim()) {
      await save(false);
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch("/ai/test", { method: "POST" });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, message: "连接测试请求失败" });
    } finally {
      setTesting(false);
    }
  };

  if (!config) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-adm-text-tertiary" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-adm-text"><Sparkles className="h-5 w-5 text-violet-500" />AI 配置</h2>
        <p className="mt-1 text-sm text-adm-text-secondary">配置 OpenAI 或兼容 Chat Completions 协议的 AI 服务</p>
      </div>

      {!config.encryptionReady && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          尚未配置有效的 AI_CONFIG_ENCRYPTION_KEY。请先在后端环境变量中设置 32 字节密钥并重启，之后才能保存 API Key。
        </div>
      )}

      <section className="rounded-2xl border border-adm-border bg-adm-card p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div><h3 className="font-semibold text-adm-text">连接与生成参数</h3><p className="mt-1 text-xs text-adm-text-tertiary">API Key 由后端加密保存，不会发送到前端</p></div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`text-xs font-medium ${config.enabled ? "text-green-600 dark:text-green-400" : "text-adm-text-tertiary"}`}>
              {config.enabled ? "已开启" : "已关闭"}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={config.enabled}
              aria-label={config.enabled ? "关闭 AI 功能" : "开启 AI 功能"}
              onClick={() => setConfig({ ...config, enabled: !config.enabled })}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${config.enabled ? "bg-green-500" : "bg-black/15 dark:bg-white/20"}`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${config.enabled ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="API Base URL" className="md:col-span-2">
            <input value={config.baseUrl} onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" className="ai-admin-input" />
            <p className="mt-1 text-[11px] text-adm-text-tertiary">系统会自动拼接 /chat/completions；兼容内网或 HTTP 地址，但应自行确认传输安全。</p>
          </Field>
          <Field label="模型">
            <input value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })} placeholder="gpt-4o-mini" className="ai-admin-input" />
          </Field>
          <Field label="API Key">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-adm-text-tertiary" />
                <input type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={config.apiKeyConfigured ? `已保存：${config.apiKeyMasked}` : "sk-..."} autoComplete="new-password" className="ai-admin-input pl-9 pr-9" />
                <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-2 top-2 rounded p-1 text-adm-text-tertiary">{showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
              {config.apiKeyConfigured && <button type="button" title="清除已保存的 Key" onClick={() => window.confirm("确定清除已保存的 API Key？") && save(true)} className="rounded-lg border border-adm-border px-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>}
            </div>
          </Field>
          <Field label={`温度：${config.temperature}`}>
            <input type="range" min="0" max="2" step="0.1" value={config.temperature} onChange={(e) => setConfig({ ...config, temperature: Number(e.target.value) })} className="w-full accent-violet-600" />
          </Field>
          <Field label="最大输出 Token">
            <input type="number" min={256} max={32768} value={config.maxTokens} onChange={(e) => setConfig({ ...config, maxTokens: Number(e.target.value) })} className="ai-admin-input" />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => save(false)} disabled={saving} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />} {saved ? "已保存" : "保存配置"}
          </button>
          <button type="button" onClick={test} disabled={testing || saving} className="flex items-center gap-2 rounded-lg border border-adm-border px-4 py-2 text-sm text-adm-text-secondary hover:bg-adm-card-hover disabled:opacity-50">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />} {testing ? "测试中…" : "测试连接"}
          </button>
          {testResult && <span className={`text-sm ${testResult.success ? "text-green-600" : "text-red-500"}`}>{testResult.message}{testResult.model ? ` · ${testResult.model}` : ""}{testResult.latencyMs ? ` · ${testResult.latencyMs}ms` : ""}</span>}
        </div>
        <p className="mt-2 text-[11px] text-adm-text-tertiary">切换开启状态后，请点击“保存配置”使设置生效。</p>
      </section>

      <section className="rounded-2xl border border-adm-border bg-adm-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-adm-text">评论自动回复</h3>
            <p className="mt-1 text-xs text-adm-text-tertiary">仅回复动态和文章中已经发布的访客评论；管理员、AI 与广告评论不会触发。</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={config.commentReplyEnabled}
            onClick={() => setConfig({ ...config, commentReplyEnabled: !config.commentReplyEnabled })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${config.commentReplyEnabled ? "bg-violet-600" : "bg-black/15 dark:bg-white/20"}`}
          >
            <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${config.commentReplyEnabled ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="回复发布方式">
            <div className="grid grid-cols-2 gap-2">
              {([{"value":"draft","label":"先存草稿"},{"value":"published","label":"直接发布"}] as const).map((item) => (
                <button key={item.value} type="button" onClick={() => setConfig({ ...config, commentReplyPublishMode: item.value })} className={`rounded-lg border px-3 py-2 text-sm ${config.commentReplyPublishMode === item.value ? "border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-400" : "border-adm-border text-adm-text-secondary"}`}>{item.label}</button>
              ))}
            </div>
          </Field>
          <Field label={`上下文消息数：${config.commentContextLimit || 10}`} help="范围 1–20，默认 10；系统还会自动限制原文与总字符数。">
            <input type="range" min="1" max="20" step="1" value={config.commentContextLimit || 10} onChange={(e) => setConfig({ ...config, commentContextLimit: Number(e.target.value) })} className="w-full accent-violet-600" />
          </Field>
        </div>
        {!config.enabled && config.commentReplyEnabled && <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">全局 AI 功能尚未开启，保存后自动回复仍不会执行。</p>}
        <p className="mt-3 text-[11px] text-adm-text-tertiary">修改后请点击上方“保存配置”使设置生效。</p>
      </section>

      <section className="rounded-2xl border border-adm-border bg-adm-card p-5 shadow-sm">
        <h3 className="font-semibold text-adm-text">自定义提示词</h3>
        <p className="mb-5 mt-1 text-xs text-adm-text-tertiary">留空也会使用默认提示词；恢复默认后需保存配置。</p>
        <div className="space-y-5">
          {MODE_LABELS.map(({ mode, label, help }) => (
            <Field key={mode} label={label} help={help}>
              <textarea rows={5} value={config.prompts[mode]} onChange={(e) => setConfig({ ...config, prompts: { ...config.prompts, [mode]: e.target.value } })} className="ai-admin-input resize-y font-mono text-xs leading-5" />
              <button type="button" onClick={() => setConfig({ ...config, prompts: { ...config.prompts, [mode]: config.defaultPrompts[mode] } })} className="mt-2 flex items-center gap-1 text-xs text-adm-text-secondary hover:text-adm-text"><RotateCcw className="h-3 w-3" />恢复默认</button>
            </Field>
          ))}
        </div>
      </section>

      <style jsx global>{`.ai-admin-input{width:100%;border-radius:.5rem;border:1px solid var(--adm-border);background:var(--adm-input);padding:.55rem .75rem;font-size:.875rem;color:var(--adm-text);outline:none}.ai-admin-input:focus{box-shadow:0 0 0 2px rgba(124,58,237,.18);border-color:#7c3aed}`}</style>
    </div>
  );
}

function Field({ label, help, className = "", children }: { label: string; help?: string; className?: string; children: React.ReactNode }) {
  return <label className={`block ${className}`}><span className="mb-1 block text-xs font-medium text-adm-text-secondary">{label}</span>{help && <span className="mb-1 block text-[11px] text-adm-text-tertiary">{help}</span>}{children}</label>;
}
