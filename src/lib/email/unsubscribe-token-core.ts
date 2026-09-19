import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const payloadSchema = z.object({
  leadId: z.string().min(1).max(80),
  tokenId: z.string().uuid(),
  expiresAt: z.number().int().positive(),
});

type Payload = z.infer<typeof payloadSchema>;

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createUnsubscribeToken(payload: Payload, secret: string): string {
  const validPayload = payloadSchema.parse(payload);
  const encoded = Buffer.from(JSON.stringify(validPayload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyUnsubscribeToken(token: string, secret: string | undefined, now = Date.now()): Payload | null {
  if (!secret || secret.length < 32) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = sign(encoded, secret);
  const left = Buffer.from(signature, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  try {
    const parsed = payloadSchema.parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
    return parsed.expiresAt * 1000 >= now ? parsed : null;
  } catch {
    return null;
  }
}
