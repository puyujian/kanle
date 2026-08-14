import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import type Post from "./Post";

interface CommentAttributes {
  id: string;
  postId: string;
  authorName: string;
  email: string;
  avatar?: string | null;
  website?: string;
  replyTo?: string;
  replyToEmail?: string;
  replyToId?: string;
  content: string;
  ip?: string;
  region?: string;
  status: "pending" | "draft" | "published" | "rejected";
  source: "visitor" | "admin" | "ai";
  reviewMethod?: "human" | "ai" | null;
  reviewReason?: string | null;
  reviewedAt?: Date | null;
  reviewedById?: string | null;
}

interface CommentCreationAttributes
  extends Optional<CommentAttributes, "id" | "avatar" | "replyTo" | "replyToEmail" | "replyToId" | "website" | "ip" | "region" | "status" | "source" | "reviewMethod" | "reviewReason" | "reviewedAt" | "reviewedById"> {}

class Comment
  extends Model<CommentAttributes, CommentCreationAttributes>
  implements CommentAttributes
{
  declare id: string;
  declare postId: string;
  declare authorName: string;
  declare email: string;
  declare avatar?: string | null;
  declare website?: string;
  declare replyTo?: string;
  declare replyToEmail?: string;
  declare replyToId?: string;
  declare content: string;
  declare ip?: string;
  declare region?: string;
  declare status: "pending" | "draft" | "published" | "rejected";
  declare source: "visitor" | "admin" | "ai";
  declare reviewMethod?: "human" | "ai" | null;
  declare reviewReason?: string | null;
  declare reviewedAt?: Date | null;
  declare reviewedById?: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
  // Association
  declare post?: Post;
}

Comment.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    postId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "posts",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    authorName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: "",
    },
    avatar: {
      type: DataTypes.STRING(512),
      allowNull: true,
    },
    website: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    replyTo: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    replyToEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    replyToId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    ip: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    region: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("pending", "draft", "published", "rejected"),
      allowNull: false,
      defaultValue: "published",
    },
    source: {
      type: DataTypes.ENUM("visitor", "admin", "ai"),
      allowNull: false,
      defaultValue: "visitor",
    },
    reviewMethod: {
      type: DataTypes.ENUM("human", "ai"),
      allowNull: true,
    },
    reviewReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    reviewedById: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "comments",
  }
);

export default Comment;
