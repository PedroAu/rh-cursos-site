import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const template = readFileSync(new URL("../template.yaml", import.meta.url), "utf8");

describe("SAM production safety", () => {
  it("keeps sending disabled and dry-run by default", () => {
    expect(template).toMatch(/ScheduleState:\n\s+Type: String\n\s+Default: DISABLED/);
    expect(template).toMatch(/RunMode:\n\s+Type: String\n\s+Default: DRY_RUN/);
    expect(template).toMatch(/AllowedTelegramChatId:\n\s+Type: String\n\s+Default: '0'/);
  });

  it("routes only approved SES events through an authenticated API destination", () => {
    expect(template).toContain("Type: AWS::SES::ConfigurationSetEventDestination");
    expect(template).toContain("Type: AWS::Events::ApiDestination");
    expect(template).toContain("ApiKeyName: x-rh-webhook-secret");
    expect(template).toContain("SecretString:sesEventsWebhookSecret");
    expect(template).toContain("'ses:configuration-set':");
    expect(template).toContain("- !Ref SesIdentityArn");
    expect(template).toContain("- !Ref SesSenderAddress");
    expect(template).toContain("State: ENABLED");
  });

  it("retains failed SES events in a protected DLQ", () => {
    expect(template).toContain("SesEventsDlq:");
    expect(template).toContain("DeletionPolicy: Retain");
    expect(template).toContain("AllowEventBridgeTargetFailures");
    expect(template).toContain("MaximumRetryAttempts: 3");
    expect(template).toContain("SesEventsDlqAlarm:");
  });
});
