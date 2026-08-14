import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import { sequelize } from "./models";
import authRoutes from "./routes/auth";
import postsRoutes from "./routes/posts";
import usersRoutes from "./routes/users";
import adminRoutes from "./routes/admin";
import uploadRoutes from "./routes/upload";
import friendsRoutes from "./routes/friends";
import settingsRoutes from "./routes/settings";
import musicRoutes from "./routes/music";
import notificationsRoutes from "./routes/notifications";
import adsRoutes from "./routes/ads";
import mediaRoutes from "./routes/media";
import locationRoutes from "./routes/location";
import urlPreviewRoutes from "./routes/url-preview";
import videoParseRoutes from "./routes/video-parse";
import pluginsRoutes from "./routes/plugins";
import doubanRoutes from "./routes/douban";
import rssRoutes from "./routes/rss";
import analyticsRoutes from "./routes/analytics";
import aiRoutes from "./routes/ai";
import { visitorCookieMiddleware } from "./middleware/visitor-cookie";
import { loadAllPlugins, watchPluginsDir } from "./music-sources/mf-manager";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

async function ensureColumn(table: string, column: string, definition: string): Promise<boolean> {
  const [rows] = await sequelize.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    { replacements: [table, column] }
  );
  if (Array.isArray(rows) && rows.length === 0) {
    await sequelize.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`Migration: ${column} column added to ${table}.`);
    return true;
  }
  return false;
}

async function ensureIndex(table: string, index: string, columns: string): Promise<void> {
  const [rows] = await sequelize.query(
    "SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
    { replacements: [table, index] }
  );
  if (Array.isArray(rows) && rows.length === 0) {
    await sequelize.query(`CREATE INDEX \`${index}\` ON \`${table}\` (${columns})`);
    console.log(`Migration: ${index} index added to ${table}.`);
  }
}

app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.CLIENT_URL || "http://localhost:3000"
        : true,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(visitorCookieMiddleware);
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/posts", postsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/friends", friendsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/music", musicRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/ads", adsRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/location", locationRoutes);
app.use("/api/url-preview", urlPreviewRoutes);
app.use("/api/video", videoParseRoutes);
app.use("/api/admin/plugins", pluginsRoutes);
app.use("/api/douban", doubanRoutes);
app.use("/api/rss", rssRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/ai", aiRoutes);

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    const limitMB = Math.round((err.limit || 0) / 1024 / 1024);
    res.status(400).json({ message: `文件过大，最大支持 ${limitMB}MB` });
    return;
  }
  if (err?.name === "MulterError") {
    res.status(400).json({ message: err.message || "文件上传失败" });
    return;
  }
  console.error(err.stack);
  res.status(500).json({ message: err.message || "服务器内部错误" });
});

async function bootstrap() {
  try {
    await sequelize.authenticate();
    console.log("Database connected.");
    // sync() only creates missing tables — does NOT alter existing tables.
    // Schema changes are managed manually via SQL to avoid duplicate-index
    // accumulation and ENUM leading-space bugs caused by sync({alter:true}).
    await sequelize.sync();
    console.log("Models synchronized.");

    // 评论审核、AI 自动回复配置与历史数据兼容迁移。
    try {
      await ensureColumn("comments", "status", "ENUM('pending','draft','published','rejected') NOT NULL DEFAULT 'published'");
      const sourceAdded = await ensureColumn("comments", "source", "ENUM('visitor','admin','ai') NOT NULL DEFAULT 'visitor'");
      await ensureColumn("comments", "avatar", "VARCHAR(512) NULL");
      await ensureColumn("comments", "review_method", "ENUM('human','ai') NULL");
      await ensureColumn("comments", "review_reason", "TEXT NULL");
      await ensureColumn("comments", "reviewed_at", "DATETIME NULL");
      await ensureColumn("comments", "reviewed_by_id", "CHAR(36) BINARY NULL");
      await ensureIndex("comments", "comments_status_created_at", "`status`, `created_at`");
      await ensureIndex("comments", "comments_reply_to_id_created_at", "`reply_to_id`, `created_at`");

      await ensureColumn("site_settings", "comment_review_mode", "ENUM('off','manual','ai') NOT NULL DEFAULT 'off'");

      await ensureColumn("ai_settings", "comment_reply_enabled", "TINYINT(1) NOT NULL DEFAULT 0");
      await ensureColumn("ai_settings", "comment_reply_publish_mode", "ENUM('draft','published') NOT NULL DEFAULT 'draft'");
      await ensureColumn("ai_settings", "comment_context_limit", "INT NOT NULL DEFAULT 10");
      await ensureColumn("ai_settings", "comment_reply_prompt", "TEXT NULL");
      await ensureColumn("ai_settings", "comment_moderation_prompt", "TEXT NULL");
      await ensureColumn("ai_settings", "post_comment_enabled", "TINYINT(1) NOT NULL DEFAULT 0");
      await ensureColumn("ai_settings", "post_comment_publish_mode", "ENUM('draft','published') NOT NULL DEFAULT 'draft'");
      await ensureColumn("ai_settings", "post_comment_nickname", "VARCHAR(100) NOT NULL DEFAULT 'AI 助手'");
      await ensureColumn("ai_settings", "post_comment_avatar", "VARCHAR(512) NOT NULL DEFAULT ''");
      await ensureColumn("ai_settings", "post_comment_prompt", "TEXT NULL");
      await sequelize.query("UPDATE `ai_settings` SET `comment_reply_prompt` = '' WHERE `comment_reply_prompt` IS NULL");
      await sequelize.query("UPDATE `ai_settings` SET `comment_moderation_prompt` = '' WHERE `comment_moderation_prompt` IS NULL");
      await sequelize.query("UPDATE `ai_settings` SET `post_comment_prompt` = '' WHERE `post_comment_prompt` IS NULL");

      // 历史博主评论只用于后台来源标识；迁移不会为历史评论创建 AI 任务。
      if (sourceAdded) {
        await sequelize.query(`
          UPDATE comments c
          INNER JOIN posts p ON p.id = c.post_id
          INNER JOIN users u ON u.id = p.user_id
          SET c.source = 'admin'
          WHERE LOWER(c.email) = LOWER(u.email) AND c.source = 'visitor'
        `);
      }
    } catch (e) {
      console.warn("Comment AI migration skipped:", (e as Error).message);
    }

    // Migration: ensure cdnProxyUrl column exists (added after initial table creation)
    // sequelize.sync() only creates missing tables, not missing columns on existing tables
    // Note: actual table name is `site_settings` (lowercase, defined in SiteSetting.ts tableName)
    try {
      const [results] = await sequelize.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_settings' AND COLUMN_NAME = 'cdnProxyUrl'"
      );
      if (Array.isArray(results) && results.length === 0) {
        await sequelize.query(
          "ALTER TABLE `site_settings` ADD COLUMN `cdnProxyUrl` VARCHAR(500) NOT NULL DEFAULT ''"
        );
        console.log("Migration: cdnProxyUrl column added to site_settings.");
      }
    } catch (e) {
      console.warn("Migration check for cdnProxyUrl skipped:", (e as Error).message);
    }

    // Migration: ensure analyticsCode column exists
    // MySQL does not allow DEFAULT on TEXT/BLOB columns, so add without DEFAULT.
    // Sequelize model still supplies defaultValue("") at the ORM layer for inserts.
    try {
      const [results] = await sequelize.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_settings' AND COLUMN_NAME = 'analyticsCode'"
      );
      if (Array.isArray(results) && results.length === 0) {
        await sequelize.query(
          "ALTER TABLE `site_settings` ADD COLUMN `analyticsCode` TEXT NULL"
        );
        console.log("Migration: analyticsCode column added to site_settings.");
      }
      // Backfill NULL rows with empty string so NOT NULL model constraint holds
      await sequelize.query(
        "UPDATE `site_settings` SET `analyticsCode` = '' WHERE `analyticsCode` IS NULL"
      );
    } catch (e) {
      console.warn("Migration check for analyticsCode skipped:", (e as Error).message);
    }

    // Migration: ensure 51.la OpenAPI config columns (laAccessKey, laSecretKey, laMaskId) exist.
    // These store the user credentials for fetching 51.la statistics in the admin dashboard.
    try {
      const cols = ["laAccessKey", "laSecretKey", "laMaskId"];
      for (const col of cols) {
        const [rows] = await sequelize.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_settings' AND COLUMN_NAME = '${col}'`
        );
        if (Array.isArray(rows) && rows.length === 0) {
          await sequelize.query(
            `ALTER TABLE \`site_settings\` ADD COLUMN \`${col}\` VARCHAR(255) NOT NULL DEFAULT ''`
          );
          console.log(`Migration: ${col} column added to site_settings.`);
        }
      }
    } catch (e) {
      console.warn("Migration check for 51.la config columns skipped:", (e as Error).message);
    }

    // 启动时清理已过期的黑名单记录
    try {
      const { blacklistService } = await import("./services/blacklist-service");
      const cleaned = await blacklistService.cleanupExpired();
      if (cleaned > 0) console.log(`Cleaned ${cleaned} expired blacklist entries.`);
    } catch (e) {
      console.warn("Blacklist cleanup skipped:", (e as Error).message);
    }

    try {
      const { startCommentAiWorker } = await import("./services/comment-ai-service");
      await startCommentAiWorker();
      console.log("Comment AI worker started.");
    } catch (e) {
      console.warn("Comment AI worker start skipped:", (e as Error).message);
    }

    // 加载 MusicFree 音源插件（酷狗/QQ/网易云/酷我/咪咕等）
    try {
      const result = await loadAllPlugins();
      console.log(`[plugins] loaded ${result.loaded} music source plugin(s)`);
      if (result.failed.length > 0) {
        console.warn("[plugins] failed:", result.failed);
      }
      watchPluginsDir();
    } catch (e) {
      console.warn("[plugins] load failed:", (e as Error).message);
    }

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Unable to bootstrap backend:", error);
    process.exit(1);
  }
}

bootstrap();
