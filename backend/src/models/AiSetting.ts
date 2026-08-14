import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface AiSettingAttributes {
  id: number;
  enabled: boolean;
  baseUrl: string;
  apiKeyEncrypted: string;
  model: string;
  temperature: number;
  maxTokens: number;
  momentPolishPrompt: string;
  articleOutlinePrompt: string;
  articleContinuePrompt: string;
  articlePolishPrompt: string;
  articleFullPrompt: string;
  commentReplyEnabled: boolean;
  commentReplyPublishMode: "draft" | "published";
  commentContextLimit: number;
  commentReplyPrompt: string;
  commentModerationPrompt: string;
  postCommentEnabled: boolean;
  postCommentPublishMode: "draft" | "published";
  postCommentNickname: string;
  postCommentAvatar: string;
  postCommentPrompt: string;
}

type AiSettingCreationAttributes = Optional<AiSettingAttributes, keyof AiSettingAttributes>;

class AiSetting
  extends Model<AiSettingAttributes, AiSettingCreationAttributes>
  implements AiSettingAttributes
{
  declare id: number;
  declare enabled: boolean;
  declare baseUrl: string;
  declare apiKeyEncrypted: string;
  declare model: string;
  declare temperature: number;
  declare maxTokens: number;
  declare momentPolishPrompt: string;
  declare articleOutlinePrompt: string;
  declare articleContinuePrompt: string;
  declare articlePolishPrompt: string;
  declare articleFullPrompt: string;
  declare commentReplyEnabled: boolean;
  declare commentReplyPublishMode: "draft" | "published";
  declare commentContextLimit: number;
  declare commentReplyPrompt: string;
  declare commentModerationPrompt: string;
  declare postCommentEnabled: boolean;
  declare postCommentPublishMode: "draft" | "published";
  declare postCommentNickname: string;
  declare postCommentAvatar: string;
  declare postCommentPrompt: string;
}

AiSetting.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    baseUrl: { type: DataTypes.STRING(500), allowNull: false, defaultValue: "https://api.openai.com/v1" },
    apiKeyEncrypted: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    model: { type: DataTypes.STRING(200), allowNull: false, defaultValue: "gpt-4o-mini" },
    temperature: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0.7 },
    maxTokens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 4096 },
    momentPolishPrompt: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    articleOutlinePrompt: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    articleContinuePrompt: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    articlePolishPrompt: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    articleFullPrompt: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    commentReplyEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    commentReplyPublishMode: { type: DataTypes.ENUM("draft", "published"), allowNull: false, defaultValue: "draft" },
    commentContextLimit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 },
    commentReplyPrompt: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    commentModerationPrompt: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    postCommentEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    postCommentPublishMode: { type: DataTypes.ENUM("draft", "published"), allowNull: false, defaultValue: "draft" },
    postCommentNickname: { type: DataTypes.STRING(100), allowNull: false, defaultValue: "AI 助手" },
    postCommentAvatar: { type: DataTypes.STRING(512), allowNull: false, defaultValue: "" },
    postCommentPrompt: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
  },
  { sequelize, tableName: "ai_settings" }
);

export default AiSetting;
