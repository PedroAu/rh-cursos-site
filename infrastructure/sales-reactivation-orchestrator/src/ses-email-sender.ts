import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";

import type { EmailSender } from "./types.js";

function safeHeader(value: string, field: string): string {
  const normalized = value.replace(/[\r\n]+/g, " ").trim();
  if (!normalized) throw new Error(`${field} is empty.`);
  return normalized;
}

function assertEmail(value: string, field: string): string {
  const normalized = safeHeader(value, field);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error(`${field} is invalid.`);
  return normalized;
}

function wrapBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function mimeMessage(input: Parameters<EmailSender["send"]>[0]): Uint8Array {
  const unsubscribeUrl = new URL(input.unsubscribeUrl);
  if (unsubscribeUrl.protocol !== "https:") throw new Error("unsubscribeUrl must use HTTPS.");
  const subject = Buffer.from(safeHeader(input.subject, "subject"), "utf8").toString("base64");
  const lines = [
    `From: RH Cursos <${assertEmail(input.from, "from")}>`,
    `Reply-To: ${assertEmail(input.replyTo, "replyTo")}`,
    `To: ${assertEmail(input.to, "to")}`,
    `Subject: =?UTF-8?B?${subject}?=`,
    `X-RH-Attempt-ID: ${safeHeader(input.idempotencyKey, "idempotencyKey")}`,
    `List-Unsubscribe: <${unsubscribeUrl.toString()}>`,
    "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(input.body),
  ];
  return Buffer.from(lines.join("\r\n"), "utf8");
}

function safeTag(value: string): string {
  return value.replace(/[^A-Za-z0-9_@.\-]/g, "_").slice(0, 256);
}

export class SesEmailSender implements EmailSender {
  private readonly client: SESv2Client;

  constructor(private readonly configurationSet?: string, client?: SESv2Client) {
    // SendEmail não oferece token de idempotência. Um retry oculto do SDK após
    // timeout pode duplicar a mensagem; a state machine externa decide o estado.
    this.client = client ?? new SESv2Client({ maxAttempts: 1 });
  }

  async send(input: Parameters<EmailSender["send"]>[0]): Promise<{ providerMessageId: string }> {
    const response = await this.client.send(new SendEmailCommand({
      FromEmailAddress: input.from,
      Destination: { ToAddresses: [input.to] },
      ReplyToAddresses: [input.replyTo],
      Content: { Raw: { Data: mimeMessage(input) } },
      ...(this.configurationSet ? { ConfigurationSetName: this.configurationSet } : {}),
      EmailTags: Object.entries(input.tags).map(([Name, Value]) => ({ Name: safeTag(Name), Value: safeTag(Value) })),
    }));
    if (!response.MessageId) throw new Error("SES returned no MessageId.");
    return { providerMessageId: response.MessageId };
  }
}

export const sesEmailInternals = { mimeMessage, safeTag };
