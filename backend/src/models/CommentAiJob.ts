import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface CommentAiJobAttributes {
  id: string;
  commentId: string;
  type: "moderation" | "reply";
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  availableAt: Date;
  lockedAt?: Date | null;
  lastError?: string | null;
  resultCommentId?: string | null;
}

type CreationAttributes = Optional<CommentAiJobAttributes, "id" | "status" | "attempts" | "availableAt" | "lockedAt" | "lastError" | "resultCommentId">;

class CommentAiJob extends Model<CommentAiJobAttributes, CreationAttributes> implements CommentAiJobAttributes {
  declare id: string;
  declare commentId: string;
  declare type: "moderation" | "reply";
  declare status: "queued" | "running" | "succeeded" | "failed";
  declare attempts: number;
  declare availableAt: Date;
  declare lockedAt?: Date | null;
  declare lastError?: string | null;
  declare resultCommentId?: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

CommentAiJob.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  commentId: { type: DataTypes.UUID, allowNull: false },
  type: { type: DataTypes.ENUM("moderation", "reply"), allowNull: false },
  status: { type: DataTypes.ENUM("queued", "running", "succeeded", "failed"), allowNull: false, defaultValue: "queued" },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  availableAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  lockedAt: { type: DataTypes.DATE, allowNull: true },
  lastError: { type: DataTypes.TEXT, allowNull: true },
  resultCommentId: { type: DataTypes.UUID, allowNull: true },
}, {
  sequelize,
  tableName: "comment_ai_jobs",
  indexes: [
    { unique: true, fields: ["comment_id", "type"] },
    { fields: ["status", "available_at"] },
  ],
});

export default CommentAiJob;
