import crypto from "crypto";

const ENV_NAME = "AI_CONFIG_ENCRYPTION_KEY";

function getEncryptionKey(): Buffer {
  const raw = (process.env[ENV_NAME] || "").trim();
  if (!raw) throw new Error(`${ENV_NAME} 未配置`);

  let key: Buffer;
  if (/^[0-9a-f]{64}$/i.test(raw)) key = Buffer.from(raw, "hex");
  else key = Buffer.from(raw, "base64");

  if (key.length !== 32) {
    throw new Error(`${ENV_NAME} 必须是 32 字节密钥（64 位十六进制或 Base64）`);
  }
  return key;
}

export function isAiEncryptionReady(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptAiSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptAiSecret(payload: string): string {
  if (!payload) return "";
  const [version, ivRaw, tagRaw, encryptedRaw] = payload.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) throw new Error("AI 密钥数据格式无效");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64")), decipher.final()]).toString("utf8");
}

export function maskApiKey(encrypted: string): string {
  if (!encrypted) return "";
  try {
    const key = decryptAiSecret(encrypted);
    if (key.length <= 8) return "••••••••";
    return `${key.slice(0, 3)}••••••${key.slice(-4)}`;
  } catch {
    return "••••••••（无法解密，请重新填写）";
  }
}
