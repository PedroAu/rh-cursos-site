import { loadConfig } from "./config.js";
import { runDryRun, runLiveBatch } from "./orchestrator.js";
import { loadSecret } from "./secrets.js";
import { SesEmailSender } from "./ses-email-sender.js";
import { SupabaseSalesStore } from "./store.js";
import { HttpTelegramSender } from "./telegram-sender.js";

export async function createRuntime() {
  const config = loadConfig();
  const secret = await loadSecret(config.secretArn);
  if (config.runMode === "LIVE" && secret.telegramChatId !== config.allowedTelegramChatId) {
    throw new Error("Telegram destination is not in the deployment allowlist.");
  }
  const store = new SupabaseSalesStore(secret);
  return {
    config,
    secret,
    store,
    email: new SesEmailSender(config.sesConfigurationSet),
    telegram: new HttpTelegramSender(secret.telegramBotToken, secret.telegramChatId, config.requestTimeoutMs),
  };
}

export async function runConfiguredMode() {
  const runtime = await createRuntime();
  if (runtime.config.runMode === "DRY_RUN") return runDryRun(runtime.store, runtime.config);
  return runLiveBatch(runtime, runtime.config, runtime.secret);
}
