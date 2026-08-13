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
  },
  { sequelize, tableName: "ai_settings" }
);

export default AiSetting;
