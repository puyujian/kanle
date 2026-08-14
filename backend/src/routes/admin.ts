import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { body, param, validationResult } from "express-validator";
import { Op } from "sequelize";
import sequelize from "../config/database";
import { User, Post, Comment, CommentLike, CommentAiJob, PostAiCommentJob, Like, SiteSetting, AiSetting } from "../models";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { blacklistService } from "../services/blacklist-service";
import { publishComment, retryCommentAiJob, retryPostAiCommentJob } from "../services/comment-ai-service";
import { triggerRevalidate } from "../utils/revalidate";
import { decryptAiSecret, isAiEncryptionReady } from "../utils/ai-crypto";

const router = Router();

// GET /api/admin/dashboard - dashboard stats
// 返回：users/posts(moments)/articles/comments/likes 总数 + 近7天 timeSeries + recentPosts + recentComments
router.get("/dashboard", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const [users, moments, articles, comments, likes] = await Promise.all([
    User.count(),
    Post.count({ where: { isAd: false, type: "moment" } }),
    Post.count({ where: { isAd: false, type: "article" } }),
    Comment.count({ where: { status: "published" } }),
    Like.count(),
  ]);

  // 近 7 天每天的活动趋势（含今天），用 raw SQL 一次性生成日期序列再 LEFT JOIN
  // 避免"某天无活动"导致日期缺失
  const [timeSeriesRows] = await sequelize.query(`
    SELECT
      d.date,
      (SELECT COUNT(*) FROM posts    WHERE DATE(created_at) = d.date AND is_ad = 0 AND type = 'moment')  AS moments,
      (SELECT COUNT(*) FROM posts    WHERE DATE(created_at) = d.date AND is_ad = 0 AND type = 'article') AS articles,
      (SELECT COUNT(*) FROM comments WHERE DATE(created_at) = d.date AND status = 'published') AS comments,
      (SELECT COUNT(*) FROM likes    WHERE DATE(created_at) = d.date)              AS likes
    FROM (
      SELECT CURDATE() - INTERVAL n DAY AS date
      FROM (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) nums
    ) d
    ORDER BY d.date ASC
  `);

  const timeSeries = (timeSeriesRows as any[]).map((r) => {
    const d = new Date(r.date);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    return {
      date: typeof r.date === "string" ? r.date : new Date(r.date).toISOString().slice(0, 10),
      label,
      posts: Number(r.moments) || 0,
      articles: Number(r.articles) || 0,
      comments: Number(r.comments) || 0,
      likes: Number(r.likes) || 0,
    };
  });

  // 最近 5 条动态（含作者昵称、内容前 100 字、是否置顶）
  const recentPostRows = await Post.findAll({
    where: { isAd: false },
    include: [{ model: User, as: "author", attributes: ["nickname"] }],
    order: [["createdAt", "DESC"]],
    limit: 5,
  });
  const recentPosts = recentPostRows.map((p: any) => ({
    id: p.id,
    content: (p.content || "").replace(/<[^>]+>/g, "").slice(0, 100),
    createdAt: p.createdAt,
    pinned: !!p.pinned,
    author: p.author?.nickname || "",
  }));

  // 最近 5 条评论（含所属动态作者和内容前 50 字）
  // 不按 isAd 过滤：评论无论在普通动态还是广告动态上都算评论，都应展示
  const recentCommentRows = await Comment.findAll({
    where: { status: "published" },
    include: [{
      model: Post,
      as: "post",
      attributes: ["id", "content"],
      required: false,
      include: [{ model: User, as: "author", attributes: ["nickname"] }],
    }],
    order: [["createdAt", "DESC"]],
    limit: 5,
  });
  const recentComments = recentCommentRows.map((c: any) => ({
    id: c.id,
    author: c.authorName,
    content: (c.content || "").slice(0, 200),
    createdAt: c.createdAt,
    postAuthor: c.post?.author?.nickname || "",
    postContent: c.post ? (c.post.content || "").replace(/<[^>]+>/g, "").slice(0, 50) : "",
  }));

  res.json({ users, posts: moments, articles, comments, likes, timeSeries, recentPosts, recentComments });
});

// GET /api/admin/users - list users
router.get("/users", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const users = await User.findAll({
    attributes: ["id", "email", "username", "nickname", "avatar", "cover", "bio", "website", "role", "createdAt"],
    order: [["createdAt", "DESC"]],
  });
  res.json(users);
});

// GET /api/admin/posts - 管理端文章/动态列表（支持 type 过滤、分页）
// type=article → 仅文章；type=moment → 仅动态；不传 → 全部（含广告）
router.get("/posts", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const where: any = {};
  const typeParam = req.query.type as string;
  if (typeParam === "article" || typeParam === "moment") {
    where.type = typeParam;
  }
  const categoryParam = req.query.category as string;
  if (categoryParam) {
    where.category = categoryParam;
  }

  const { count, rows: posts } = await Post.findAndCountAll({
    where,
    include: [
      { model: User, as: "author", attributes: ["id", "nickname", "avatar"] },
      { model: PostAiCommentJob, as: "aiCommentJob", required: false },
    ],
    order: [["pinned", "DESC"], ["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  res.json({
    data: posts.map((p: any) => ({
      id: p.id,
      shortId: p.shortId,
      type: p.type || "moment",
      title: p.title || "",
      excerpt: p.excerpt || "",
      cover: p.cover || "",
      category: p.category || "",
      content: (p.content || "").replace(/<[^>]+>/g, "").slice(0, 200),
      articleType: p.articleType || "original",
      repostUrl: p.repostUrl || "",
      pinned: !!p.pinned,
      isAd: !!p.isAd,
      status: p.status || "published",
      createdAt: p.createdAt,
      author: p.author?.nickname || "",
      aiCommentJob: p.aiCommentJob ? {
        status: p.aiCommentJob.status,
        attempts: p.aiCommentJob.attempts,
        lastError: p.aiCommentJob.lastError || "",
        fallbackReason: p.aiCommentJob.fallbackReason || "",
        publishMode: p.aiCommentJob.publishMode,
        resultCommentId: p.aiCommentJob.resultCommentId || null,
      } : null,
    })),
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
  });
});

// PUT /api/admin/users/:id - update user (admin only)
router.put(
  "/users/:id",
  authenticate,
  requireAdmin,
  [
    body("nickname").optional().trim().isLength({ min: 1, max: 100 }),
    body("bio").optional().trim().isLength({ max: 255 }),
    body("website").optional().trim().isLength({ max: 255 }),
    body("avatar").optional().trim().isLength({ max: 500 }),
    body("cover").optional().trim().isLength({ max: 500 }),
    body("email").optional().trim().isEmail().normalizeEmail(),
    body("username")
      .optional()
      .trim()
      .isLength({ min: 3, max: 50 })
      .matches(/^[a-zA-Z0-9_]+$/),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const user = await User.findByPk(req.params.id as string);
    if (!user) {
      res.status(404).json({ message: "用户不存在" });
      return;
    }

    // Check email uniqueness if changing
    if (req.body.email && req.body.email !== user.email) {
      const existing = await User.findOne({ where: { email: req.body.email } });
      if (existing) {
        res.status(409).json({ message: "该邮箱已被使用" });
        return;
      }
    }

    // Check username uniqueness if changing
    if (req.body.username && req.body.username !== user.username) {
      const existing = await User.findOne({ where: { username: req.body.username } });
      if (existing) {
        res.status(409).json({ message: "该用户名已被使用" });
        return;
      }
    }

    await user.update({
      nickname: req.body.nickname ?? user.nickname,
      bio: req.body.bio ?? user.bio,
      website: req.body.website ?? user.website,
      avatar: req.body.avatar ?? user.avatar,
      cover: req.body.cover ?? user.cover,
      email: req.body.email ?? user.email,
      username: req.body.username ?? user.username,
    });

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      cover: user.cover,
      bio: user.bio,
      website: user.website,
      role: user.role,
    });
  }
);

// POST /api/admin/change-password - change own password
router.post(
  "/change-password",
  authenticate,
  [
    body("oldPassword").isLength({ min: 1 }),
    body("newPassword").isLength({ min: 6 }),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({ message: "用户不存在" });
      return;
    }

    const valid = await bcrypt.compare(req.body.oldPassword, user.password);
    if (!valid) {
      res.status(401).json({ message: "原密码错误" });
      return;
    }

    user.password = await bcrypt.hash(req.body.newPassword, 10);
    await user.save();

    res.json({ message: "密码修改成功" });
  }
);

// GET /api/admin/comments - list all comments with post info
router.get("/comments", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const [comments, grouped] = await Promise.all([Comment.findAll({
    include: [
      {
        model: Post,
        as: "post",
        attributes: ["id", "content"],
        include: [
          { model: User, as: "author", attributes: ["nickname"] },
        ],
      },
      { model: CommentAiJob, as: "aiJobs", required: false },
    ],
    order: [["createdAt", "DESC"]],
  }), Comment.findAll({
    attributes: ["status", [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
    group: ["status"],
    raw: true,
  })]);

  const counts: Record<string, number> = { all: comments.length, pending: 0, draft: 0, published: 0, rejected: 0 };
  for (const row of grouped as any[]) counts[row.status] = Number(row.count) || 0;
  res.json({
    counts,
    data: comments.map((c) => ({
      id: c.id,
      author: c.authorName,
      email: c.email,
      avatar: c.avatar || "",
      website: c.website,
      content: c.content,
      replyTo: c.replyTo,
      replyToId: c.replyToId,
      region: c.region || "",
      status: c.status,
      source: c.source,
      reviewMethod: c.reviewMethod || null,
      reviewReason: c.reviewReason || "",
      reviewedAt: c.reviewedAt || null,
      createdAt: c.createdAt,
      aiJobs: ((c as any).aiJobs || []).map((job: CommentAiJob) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        attempts: job.attempts,
        lastError: job.lastError || "",
        resultCommentId: job.resultCommentId || null,
      })),
      post: c.post
        ? {
            id: c.post.id,
            content: c.post.content?.slice(0, 50) || "",
            author: c.post.author?.nickname || "",
          }
        : null,
    })),
  });
});

async function deleteCommentTrees(ids: string[]): Promise<number> {
  const selected = await Comment.findAll({ where: { id: { [Op.in]: ids } }, attributes: ["id", "postId", "replyToId", "status"] });
  if (!selected.length) return 0;
  const postIds = [...new Set(selected.map((item) => item.postId))];
  const all = await Comment.findAll({ where: { postId: { [Op.in]: postIds } }, attributes: ["id", "postId", "replyToId", "status"] });
  const targets = new Set(selected.map((item) => item.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of all) {
      if (item.replyToId && targets.has(item.replyToId) && !targets.has(item.id)) {
        targets.add(item.id);
        changed = true;
      }
    }
  }
  const targetIds = [...targets];
  const hadPublished = all.some((item) => targets.has(item.id) && item.status === "published");
  await sequelize.transaction(async (transaction) => {
    await PostAiCommentJob.update(
      { resultCommentId: null, status: "skipped", lastError: "生成的评论已删除" },
      { where: { resultCommentId: { [Op.in]: targetIds } }, transaction }
    );
    await CommentLike.destroy({ where: { commentId: { [Op.in]: targetIds } }, transaction });
    await CommentAiJob.destroy({
      where: { [Op.or]: [{ commentId: { [Op.in]: targetIds } }, { resultCommentId: { [Op.in]: targetIds } }] },
      transaction,
    });
    await Comment.destroy({ where: { id: { [Op.in]: targetIds } }, transaction });
  });
  if (hadPublished) triggerRevalidate();
  return targetIds.length;
}

async function applyCommentAction(comment: Comment, action: "approve" | "reject", adminId: string): Promise<boolean> {
  if (action === "approve") {
    if (!["pending", "draft", "rejected"].includes(comment.status)) return false;
    return publishComment(comment, { method: "human", reason: "管理员审核通过", reviewedById: adminId });
  }
  if (!["pending", "draft"].includes(comment.status)) return false;
  await comment.update({
    status: "rejected",
    reviewMethod: "human",
    reviewReason: "管理员审核拒绝",
    reviewedAt: new Date(),
    reviewedById: adminId,
  });
  return true;
}

router.put(
  "/comments/:id",
  authenticate,
  requireAdmin,
  [
    param("id").isUUID(),
    body("author").trim().isLength({ min: 1, max: 100 }),
    body("email").optional({ checkFalsy: true }).trim().isEmail().normalizeEmail(),
    body("website").optional({ nullable: true }).trim().isLength({ max: 255 }),
    body("content").trim().isLength({ min: 1, max: 5000 }),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    const comment = await Comment.findByPk(req.params.id as string);
    if (!comment) { res.status(404).json({ message: "评论不存在" }); return; }
    await comment.update({
      authorName: req.body.author,
      email: req.body.email || "",
      website: req.body.website || null,
      content: req.body.content,
    });
    if (comment.status === "published") triggerRevalidate();
    res.json({ author: comment.authorName, email: comment.email, website: comment.website, content: comment.content });
  }
);

router.patch(
  "/comments/:id/status",
  authenticate,
  requireAdmin,
  [param("id").isUUID(), body("action").isIn(["approve", "reject"])],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    const comment = await Comment.findByPk(req.params.id as string);
    if (!comment) { res.status(404).json({ message: "评论不存在" }); return; }
    const changed = await applyCommentAction(comment, req.body.action, req.user!.id);
    if (!changed) { res.status(409).json({ message: "当前状态不能执行该操作" }); return; }
    res.json({ id: comment.id, status: comment.status, reviewMethod: comment.reviewMethod, reviewReason: comment.reviewReason });
  }
);

router.post(
  "/comments/bulk",
  authenticate,
  requireAdmin,
  [body("ids").isArray({ min: 1, max: 500 }), body("ids.*").isUUID(), body("action").isIn(["approve", "reject", "delete"])],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    const ids = [...new Set(req.body.ids as string[])];
    if (req.body.action === "delete") {
      const deleted = await deleteCommentTrees(ids);
      res.json({ updated: 0, deleted, skipped: Math.max(0, ids.length - deleted) });
      return;
    }
    const comments = await Comment.findAll({ where: { id: { [Op.in]: ids } } });
    let updated = 0;
    for (const comment of comments) {
      if (await applyCommentAction(comment, req.body.action, req.user!.id)) updated++;
    }
    res.json({ updated, deleted: 0, skipped: ids.length - updated });
  }
);

router.post(
  "/comments/:id/ai-retry",
  authenticate,
  requireAdmin,
  [param("id").isUUID(), body("type").optional().isIn(["moderation", "reply"])],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    try {
      const job = await retryCommentAiJob(req.params.id as string, req.body.type);
      res.json({ id: job.id, status: job.status, type: job.type });
    } catch (error) {
      res.status(409).json({ message: (error as Error).message });
    }
  }
);

// DELETE /api/admin/comments/:id - delete a comment
router.delete(
  "/comments/:id",
  authenticate,
  requireAdmin,
  param("id").isUUID(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const comment = await Comment.findByPk(req.params.id as string);
    if (!comment) {
      res.status(404).json({ message: "评论不存在" });
      return;
    }

    await deleteCommentTrees([comment.id]);
    res.status(204).send();
  }
);

// ============ 黑名单管理 ============

// GET /api/admin/blacklist - 列出所有黑名单（含已过期，前端可筛选）
router.get("/blacklist", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const list = await blacklistService.list();
  res.json(
    list.map((b) => ({
      id: b.id,
      type: b.type,
      value: b.value,
      reason: b.reason,
      expiresAt: b.expiresAt,
      createdAt: b.createdAt,
    }))
  );
});

router.get("/post-ai-comments", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const jobs = await PostAiCommentJob.findAll({ order: [["createdAt", "DESC"]] });
  res.json({
    data: jobs.map((job) => ({
      postId: job.postId,
      status: job.status,
      attempts: job.attempts,
      lastError: job.lastError || "",
      fallbackReason: job.fallbackReason || "",
      publishMode: job.publishMode,
      resultCommentId: job.resultCommentId || null,
    })),
  });
});

router.post(
  "/posts/:id/ai-comment-retry",
  authenticate,
  requireAdmin,
  [param("id").isUUID()],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    try {
      const job = await retryPostAiCommentJob(req.params.id as string);
      res.json({ postId: job.postId, status: job.status });
    } catch (error) {
      res.status(409).json({ message: (error as Error).message });
    }
  }
);

// GET /api/admin/blacklist/status - 获取评论防刷总开关状态
router.get("/blacklist/status", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const enabled = await blacklistService.isAntiSpamEnabled();
  res.json({ enabled });
});

// PUT /api/admin/blacklist/status - 切换评论防刷总开关
router.put(
  "/blacklist/status",
  authenticate,
  requireAdmin,
  body("enabled").isBoolean(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    await blacklistService.setAntiSpamEnabled(req.body.enabled);
    res.json({ enabled: req.body.enabled });
  }
);

async function aiRuntimeAvailable(): Promise<boolean> {
  if (!isAiEncryptionReady()) return false;
  const setting = await AiSetting.findByPk(1);
  if (!setting?.enabled || !setting.model || !setting.apiKeyEncrypted) return false;
  try {
    return !!decryptAiSecret(setting.apiKeyEncrypted);
  } catch {
    return false;
  }
}

router.get("/blacklist/comment-review", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const [mode, aiAvailable] = await Promise.all([
    blacklistService.getCommentReviewMode(),
    aiRuntimeAvailable(),
  ]);
  res.json({ mode, aiAvailable });
});

router.put(
  "/blacklist/comment-review",
  authenticate,
  requireAdmin,
  body("mode").isIn(["off", "manual", "ai"]),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    if (req.body.mode === "ai" && !(await aiRuntimeAvailable())) {
      res.status(400).json({ message: "请先在 AI 配置中启用并完成模型与 API Key 配置" });
      return;
    }
    await blacklistService.setCommentReviewMode(req.body.mode);
    res.json({ mode: req.body.mode, aiAvailable: await aiRuntimeAvailable() });
  }
);

// POST /api/admin/blacklist - 添加封禁
// body: { type: 'email'|'ip', value, reason?, durationMs?: number|null }
// durationMs=null 或不传 → 永久；数字 → 毫秒后过期
router.post(
  "/blacklist",
  authenticate,
  requireAdmin,
  [
    body("type").isIn(["email", "ip"]),
    body("value").trim().isLength({ min: 1, max: 255 }),
    body("reason").optional().trim().isLength({ max: 255 }),
    body("durationMs").optional({ nullable: true }).isInt({ min: 60_000, max: 365 * 24 * 60 * 60 * 1000 }),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { type, value, reason, durationMs } = req.body;
    const record = await blacklistService.add(
      type,
      value,
      reason || null,
      durationMs === undefined ? null : Number(durationMs)
    );
    res.status(201).json({
      id: record.id,
      type: record.type,
      value: record.value,
      reason: record.reason,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    });
  }
);

// DELETE /api/admin/blacklist/:id - 移除封禁（解封）
router.delete(
  "/blacklist/:id",
  authenticate,
  requireAdmin,
  param("id").isUUID(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const ok = await blacklistService.remove(req.params.id as string);
    if (!ok) {
      res.status(404).json({ message: "黑名单记录不存在" });
      return;
    }
    res.status(204).send();
  }
);

// GET /api/admin/blacklist/banned-words - 获取违禁词列表
router.get("/blacklist/banned-words", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const setting = await SiteSetting.findByPk(1);
  let words: string[] = [];
  if (setting?.bannedWords) {
    try {
      words = JSON.parse(setting.bannedWords);
      if (!Array.isArray(words)) words = [];
    } catch {
      words = [];
    }
  }
  res.json({ words });
});

// PUT /api/admin/blacklist/banned-words - 更新违禁词列表
router.put(
  "/blacklist/banned-words",
  authenticate,
  requireAdmin,
  body("words").isArray(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const rawWords: string[] = req.body.words;
    const words = rawWords
      .map((w) => String(w).trim())
      .filter((w) => w.length > 0 && w.length <= 100)
      .slice(0, 500);
    const [setting] = await SiteSetting.findOrCreate({ where: { id: 1 }, defaults: { id: 1 } });
    await setting.update({ bannedWords: JSON.stringify(words) });
    res.json({ words });
  }
);

export default router;
