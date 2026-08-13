import { apiFetch } from "./api-fetch";

export type AiMode =
  | "moment_polish"
  | "article_outline"
  | "article_continue"
  | "article_polish"
  | "article_full";

export interface AiGenerateInput {
  mode: AiMode;
  content?: string;
  title?: string;
  topic?: string;
  requirements?: string;
}

export interface AiDonePayload {
  model?: string;
  title?: string;
  body?: string;
}

export async function streamAiGeneration(
  input: AiGenerateInput,
  options: {
    signal?: AbortSignal;
    onDelta: (text: string) => void;
  }
): Promise<AiDonePayload> {
  const res = await apiFetch("/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(input),
    signal: options.signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `AI 请求失败（${res.status}）`);
  }
  if (!res.body) throw new Error("浏览器不支持流式响应");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let donePayload: AiDonePayload = {};

  const consume = (block: string) => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;
    const data = JSON.parse(dataLines.join("\n"));
    if (event === "delta" && data.text) options.onDelta(data.text);
    if (event === "done") donePayload = data;
    if (event === "error") throw new Error(data.message || "AI 生成失败");
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r\n/g, "\n");
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      consume(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
    }
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
  return donePayload;
}

export function htmlToPlainText(html: string): string {
  if (!html) return "";
  if (typeof document === "undefined") return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function plainTextToParagraphHtml(text: string): string {
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => `<p>${escape(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export interface ProtectedHtml {
  text: string;
  fragments: string[];
}

/** 将富媒体/链接/表情替换成稳定占位符，只把可润色文字发给 AI。 */
export function protectRichHtml(html: string): ProtectedHtml {
  if (typeof document === "undefined") return { text: htmlToPlainText(html), fragments: [] };
  const doc = new DOMParser().parseFromString(`<div id="ai-root">${html}</div>`, "text/html");
  const root = doc.getElementById("ai-root")!;
  const fragments: string[] = [];
  const selector = [
    "div[data-image-grid]", "div[data-embed]", "a.link-card", "img", "a[href]",
  ].join(",");
  for (const node of Array.from(root.querySelectorAll(selector))) {
    if (!node.isConnected || node.parentElement?.closest(selector)) continue;
    const index = fragments.length;
    fragments.push(node.outerHTML);
    const inline = node.matches("a[href], img.inline-emoji");
    node.replaceWith(doc.createTextNode(inline ? `[[MEDIA_${index}]]` : `\n\n[[MEDIA_${index}]]\n\n`));
  }
  const text = root.innerHTML
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, fragments };
}

export function restoreProtectedHtml(text: string, fragments: string[], toHtml: (value: string) => string): string {
  let last = -1;
  for (let i = 0; i < fragments.length; i++) {
    const token = `[[MEDIA_${i}]]`;
    if (text.split(token).length !== 2 || text.indexOf(token) < last) {
      throw new Error("AI 结果未能完整保留富媒体位置，请重新生成或缩小润色范围");
    }
    last = text.indexOf(token);
  }
  let html = toHtml(text);
  fragments.forEach((fragment, i) => {
    const token = `[[MEDIA_${i}]]`;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(new RegExp(`<p>\\s*${escaped}\\s*</p>`), fragment);
    html = html.replace(token, fragment);
  });
  return html;
}
