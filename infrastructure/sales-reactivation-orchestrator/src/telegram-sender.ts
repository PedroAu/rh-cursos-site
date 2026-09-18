import type { TelegramSender } from "./types.js";

export class HttpTelegramSender implements TelegramSender {
  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
    private readonly timeoutMs: number,
  ) {}

  async send(text: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: this.chatId, text, disable_web_page_preview: true }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Telegram request failed with HTTP ${response.status}.`);
      const payload = await response.json() as { ok?: boolean };
      if (!payload.ok) throw new Error("Telegram rejected the notification.");
    } finally {
      clearTimeout(timeout);
    }
  }
}
