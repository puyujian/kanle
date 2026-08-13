import type { Metadata } from "next";
import AdminAiConfig from "./AdminAiConfig";

export const metadata: Metadata = { title: "管理后台 - AI 配置" };

export default function AiConfigPage() {
  return <AdminAiConfig />;
}
