import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface PostAiCommentJobAttributes {
  id: string;
  postId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "skipped";
  attempts: number;
  availableAt: Date;
  lockedAt?: Date | null;
  lastError?: string | null;
  fallbackReason?: string | null;
  publishMode: "draft" | "published";
  resultCommentId?: string | null;
}

type CreationAttributes = Optional<
  PostAiCommentJobAttributes,
  "id" | "status" | "attempts" | "availableAt" | "lockedAt" | "lastError" | "fallbackReason" | "resultCommentId"
>;

class PostAiCommentJob
  extends Model<PostAiCommentJobAttributes, CreationAttributes>
  implements PostAiCommentJobAttributes
{
  declare id: string;
  declare postId: string;
  declare status: "queued" | "running" | "succeeded" | "failed" | "skipped";
  declare attempts: number;
  declare availableAt: Date;
  declare lockedAt?: Date | null;
  declare lastError?: string | null;
  declare fallbackReason?: string | null;
  declare publishMode: "draft" | "published";
  declare resultCommentId?: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

PostAiCommentJob.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    postId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: "posts", key: "id" },
      onDelete: "CASCADE",
    },
    status: {
      type: DataTypes.ENUM("queued", "running", "succeeded", "failed", "skipped"),
      allowNull: false,
      defaultValue: "queued",
    },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    availableAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    lockedAt: { type: DataTypes.DATE, allowNull: true },
    lastError: { type: DataTypes.TEXT, allowNull: true },
    fallbackReason: { type: DataTypes.TEXT, allowNull: true },
    publishMode: { type: DataTypes.ENUM("draft", "published"), allowNull: false, defaultValue: "draft" },
    resultCommentId: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    tableName: "post_ai_comment_jobs",
    indexes: [{ fields: ["status", "available_at"] }],
  }
);

export default PostAiCommentJob;
