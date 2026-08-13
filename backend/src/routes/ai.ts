import { Router, Response } from "express";
import { body, validationResult } from "express-validator";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { decryptAiSecret, encryptAiSecret, isAiEncryptionReady, maskApiKey } from "../utils/ai-crypto";
import {
  DEFAULT_AI_PROMPTS,
  AiMode,
  ensureAiSetting,
  normalizeBaseUrl,
  parseFullArticle,
  streamAiCompletion,
  testAiConnection,
} from "../services/ai-service";

const router = Router();
const MODES: AiMode[] = [
  "moment_polish",
  "article_outline",
  "article_continue",
  "article_polish",
  "article_full",
];

router.use(authenticate, requireAdmin);

function publicConfig(setting: Awaited<ReturnType<typeof ensureAiSetting>>) {
  return {
    enabled: setting.enabled,
    baseUrl: setting.baseUrl,
    model: setting.model,
    temperature: setting.temperature,
    maxTokens: setting.maxTokens,
    apiKeyConfigured: !!setting.apiKeyEncrypted,
    apiKeyMasked: maskApiKey(setting.apiKeyEncrypted),
    encryptionReady: isAiEncryptionReady(),
    prompts: {
      moment_polish: setting.momentPolishPrompt || DEFAULT_AI_PROMPTS.moment_polish,
      article_outline: setting.articleOutlinePrompt || DEFAULT_AI_PROMPTS.article_outline,
      article_continue: setting.articleContinuePrompt || DEFAULT_AI_PROMPTS.article_continue,
      article_polish: setting.articlePolishPrompt || DEFAULT_AI_PROMPTS.article_polish,
      article_full: setting.articleFullPrompt || DEFAULT_AI_PROMPTS.article_full,
    },
    defaultPrompts: DEFAULT_AI_PROMPTS,
  };
}

router.get("/config", async (_req: AuthRequest, res: Response) => {
  res.json(publicConfig(await ensureAiSetting()));
});

router.get("/status", async (_req: AuthRequest, res: Response) => {
  const setting = await ensureAiSetting();
  let apiKeyUsable = false;
  try {
    apiKeyUsable = !!decryptAiSecret(setting.apiKeyEncrypted);
  } catch {
    apiKeyUsable = false;
  }
  res.json({
    available: setting.enabled && apiKeyUsable && !!setting.model && isAiEncryptionReady(),
    enabled: setting.enabled,
    configured: apiKeyUsable && !!setting.model,
    encryptionReady: isAiEncryptionReady(),
  });
});

router.put(
  "/config",
  [
    body("enabled").optional().isBoolean(),
    body("baseUrl").optional().isString().isLength({ min: 1, max: 500 }),
    body("apiKey").optional().isString().isLength({ min: 1, max: 1000 }),
    body("clearApiKey").optional().isBoolean(),
    body("model").optional().trim().isLength({ min: 1, max: 200 }),
    body("temperature").optional().isFloat({ min: 0, max: 2 }),
    body("maxTokens").optional().isInt({ min: 256, max: 32768 }),
    body("prompts").optional().isObject(),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ message: "AI 配置格式不正确", errors: errors.array() });
      return;
    }

    try {
      const setting = await ensureAiSetting();
      const prompts = req.body.prompts || {};
      for (const mode of MODES) {
        if (prompts[mode] !== undefined && (typeof prompts[mode] !== "string" || prompts[mode].length > 20000)) {
          res.status(400).json({ message: "提示词必须是 20000 字以内的文本" });
          return;
        }
      }

      let apiKeyEncrypted = setting.apiKeyEncrypted;
      if (req.body.clearApiKey === true) apiKeyEncrypted = "";
      if (req.body.apiKey) {
        if (!isAiEncryptionReady()) {
          res.status(400).json({ message: "请先配置有效的 AI_CONFIG_ENCRYPTION_KEY 并重启后端" });
          return;
        }
        apiKeyEncrypted = encryptAiSecret(String(req.body.apiKey).trim());
      }

      await setting.update({
        enabled: req.body.enabled ?? setting.enabled,
        baseUrl: req.body.baseUrl !== undefined ? normalizeBaseUrl(req.body.baseUrl) : setting.baseUrl,
        apiKeyEncrypted,
        model: req.body.model ?? setting.model,
        temperature: req.body.temperature ?? setting.temperature,
        maxTokens: req.body.maxTokens ?? setting.maxTokens,
        momentPolishPrompt: prompts.moment_polish ?? setting.momentPolishPrompt,
        articleOutlinePrompt: prompts.article_outline ?? setting.articleOutlinePrompt,
        articleContinuePrompt: prompts.article_continue ?? setting.articleContinuePrompt,
        articlePolishPrompt: prompts.article_polish ?? setting.articlePolishPrompt,
        articleFullPrompt: prompts.article_full ?? setting.articleFullPrompt,
      });
      res.json(publicConfig(setting));
    } catch (error) {
      res.status(400).json({ message: (error as Error).message || "保存 AI 配置失败" });
    }
  }
);

router.post("/test", async (_req: AuthRequest, res: Response) => {
  try {
    const result = await testAiConnection();
    res.json({ success: true, message: result.text || "连接成功", model: result.model, latencyMs: result.latencyMs });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message || "连接测试失败" });
  }
});

router.post(
  "/generate",
  [
    body("mode").isIn(MODES),
    body("content").optional().isString().isLength({ max: 50000 }),
    body("title").optional().isString().isLength({ max: 200 }),
    body("topic").optional().isString().isLength({ max: 200 }),
    body("requirements").optional().isString().isLength({ max: 2000 }),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ message: "生成参数格式不正确", errors: errors.array() });
      return;
    }
    const mode = req.body.mode as AiMode;
    const content = String(req.body.content || "").trim();
    const title = String(req.body.title || "").trim();
    const topic = String(req.body.topic || "").trim();
    const requirements = String(req.body.requirements || "").trim();
    if (mode === "moment_polish" && !content) {
      res.status(400).json({ message: "请先输入需要润色的内容" });
      return;
    }
    if (["article_outline", "article_full"].includes(mode) && !topic && !title) {
      res.status(400).json({ message: "请填写文章主题或标题" });
      return;
    }
    if (["article_continue", "article_polish"].includes(mode) && !content) {
      res.status(400).json({ message: "请先输入文章内容" });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);
    req.on("aborted", () => controller.abort());
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    const send = (event: string, data: unknown) => {
      if (!res.writableEnded && !res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await streamAiCompletion({
        mode,
        input: { content, title, topic, requirements },
        signal: controller.signal,
        onDelta: (text) => send("delta", { text }),
      });
      const full = mode === "article_full" ? parseFullArticle(result.text) : undefined;
      send("done", { model: result.model, ...(full || {}) });
    } catch (error) {
      if (!res.destroyed) {
        send("error", {
          message: (error as Error).name === "AbortError" ? "生成已取消或超时" : (error as Error).message || "AI 生成失败",
        });
      }
    } finally {
      clearTimeout(timeout);
      if (!res.writableEnded && !res.destroyed) res.end();
    }
  }
);

export default router;
