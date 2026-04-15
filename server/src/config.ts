import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? "4000"),
  databaseUrl: required("DATABASE_URL", "file:./dev.db"),
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiBaseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
  llmModel: process.env.LLM_MODEL ?? "gpt-4o-mini",
};

export function isLlmConfigured(): boolean {
  return config.openaiApiKey.length > 0;
}
