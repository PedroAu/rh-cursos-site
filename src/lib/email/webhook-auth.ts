import "server-only";

import { timingSafeEqual } from "node:crypto";

function asBuffer(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

export function isValidWebhookSecret(candidate: string | null, expected: string | undefined): boolean {
  if (!candidate || !expected || expected.length < 32) return false;
  const left = asBuffer(candidate);
  const right = asBuffer(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

