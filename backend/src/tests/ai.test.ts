import assert from "node:assert/strict";
import test from "node:test";
import { decryptAiSecret, encryptAiSecret, isAiEncryptionReady, maskApiKey } from "../utils/ai-crypto";
import { buildAiPrompt, normalizeBaseUrl, parseFullArticle, readChatCompletionResponse } from "../services/ai-service";
import { commentAiInternals } from "../services/comment-ai-service";

test("AI secret encryption round-trip and masking", () => {
  process.env.AI_CONFIG_ENCRYPTION_KEY = "a".repeat(64);
  const encrypted = encryptAiSecret("sk-test-1234567890");
  assert.notEqual(encrypted, "sk-test-1234567890");
  assert.equal(decryptAiSecret(encrypted), "sk-test-1234567890");
  assert.equal(maskApiKey(encrypted), "sk-••••••7890");
  assert.equal(isAiEncryptionReady(), true);
});

test("AI encryption rejects invalid master keys", () => {
  process.env.AI_CONFIG_ENCRYPTION_KEY = "too-short";
  assert.equal(isAiEncryptionReady(), false);
  assert.throws(() => encryptAiSecret("secret"), /32 字节/);
});

test("prompt interpolation and full article parsing", () => {
  const fakeSetting = {
    momentPolishPrompt: "标题：{{title}}\n正文：{{content}}",
    articleOutlinePrompt: "",
    articleContinuePrompt: "",
    articlePolishPrompt: "",
    articleFullPrompt: "",
  } as any;
  assert.equal(buildAiPrompt(fakeSetting, "moment_polish", { title: "测试", content: "你好" }), "标题：测试\n正文：你好");
  assert.deepEqual(parseFullArticle("# 测试标题\n\n正文内容"), { title: "测试标题", body: "正文内容" });
  assert.deepEqual(parseFullArticle("没有标题的正文"), { title: "", body: "没有标题的正文" });
});

test("base URL normalization rejects unsafe URL shapes", () => {
  assert.equal(normalizeBaseUrl("https://api.openai.com/v1/"), "https://api.openai.com/v1");
  assert.throws(() => normalizeBaseUrl("ftp://example.com/v1"), /HTTP/);
  assert.throws(() => normalizeBaseUrl("https://user:pass@example.com/v1"), /凭据/);
  assert.throws(() => normalizeBaseUrl("https://example.com/v1?token=x"), /查询参数/);
});

test("fragmented Chat Completions SSE is decoded and emitted", async () => {
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"model":"compatible-model","choices":[{"delta":{"content":"你"}}]}\n',
    '\ndata: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DO',
    'NE]\n\n',
  ];
  const response = new Response(new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  }), { headers: { "content-type": "text/event-stream" } });
  const deltas: string[] = [];
  const result = await readChatCompletionResponse(response, "fallback", 100, (text) => deltas.push(text));
  assert.deepEqual(deltas, ["你", "好"]);
  assert.deepEqual(result, { model: "compatible-model", text: "你好" });
});

test("non-streaming compatible JSON falls back to one delta", async () => {
  const response = new Response(JSON.stringify({
    model: "json-model",
    choices: [{ message: { content: "一次返回" } }],
  }), { headers: { "content-type": "application/json" } });
  const deltas: string[] = [];
  const result = await readChatCompletionResponse(response, "fallback", 100, (text) => deltas.push(text));
  assert.deepEqual(deltas, ["一次返回"]);
  assert.deepEqual(result, { model: "json-model", text: "一次返回" });
});

test("comment moderation JSON is parsed strictly with markdown fence compatibility", () => {
  assert.deepEqual(
    commentAiInternals.parseModeration('```json\n{"decision":"manual","reason":"需要人工判断"}\n```'),
    { decision: "manual", reason: "需要人工判断" }
  );
  assert.throws(
    () => commentAiInternals.parseModeration('{"decision":"publish","reason":"bad"}'),
    /decision/
  );
});

test("comment thread context keeps root and target, follows nested replies, and respects limit", () => {
  const make = (id: string, content: string, replyToId?: string, source: "visitor" | "admin" | "ai" = "visitor", minute = 0) => ({
    id,
    content,
    replyToId,
    source,
    authorName: source === "visitor" ? `访客${id}` : "博主",
    createdAt: new Date(2026, 0, 1, 0, minute),
  });
  const comments = [
    make("root", "第一条"),
    make("ai1", "第一次回复", "root", "ai", 1),
    make("user2", "继续追问", "ai1", "visitor", 2),
    make("ai2", "第二次回复", "user2", "ai", 3),
    make("target", "最后问题", "ai2", "visitor", 4),
    make("other", "另一个线程", undefined, "visitor", 5),
  ] as any;
  const thread = commentAiInternals.buildThread(comments, comments[4], 3);
  assert.match(thread, /第一条/);
  assert.match(thread, /第二次回复/);
  assert.match(thread, /最后问题/);
  assert.doesNotMatch(thread, /另一个线程/);
  assert.equal(thread.split("\n").length, 3);
});
