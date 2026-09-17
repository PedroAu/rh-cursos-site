import type { DeliveryResult, EventSink, NormalizedImapEvent } from "./types.js";

export class RetriableDeliveryError extends Error {
  constructor(public readonly status: number | null, message: string) {
    super(message);
    this.name = "RetriableDeliveryError";
  }
}

export class HttpEventSink implements EventSink {
  constructor(
    private readonly endpointUrl: string,
    private readonly webhookSecret: string,
    private readonly timeoutMs: number,
  ) {}

  async deliver(event: NormalizedImapEvent): Promise<DeliveryResult> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(this.endpointUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-rh-webhook-secret": this.webhookSecret,
          },
          body: JSON.stringify(event),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (response.ok) return "ACCEPTED";
        await response.body?.cancel();
        if (response.status === 400 || response.status === 422) return "REJECTED";
        if (response.status === 401 || response.status === 403) {
          throw new RetriableDeliveryError(response.status, "CRM webhook authentication failed.");
        }
        if (response.status === 429 || response.status >= 500) {
          throw new RetriableDeliveryError(response.status, "CRM webhook is temporarily unavailable.");
        }
        return "REJECTED";
      } catch (error) {
        lastError = error;
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** (attempt - 1)));
      }
    }

    if (lastError instanceof RetriableDeliveryError) throw lastError;
    throw new RetriableDeliveryError(null, "CRM webhook request failed.");
  }
}
