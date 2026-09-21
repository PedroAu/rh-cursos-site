import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const template = readFileSync(new URL("../template.yaml", import.meta.url), "utf8");

describe("SAM production safety", () => {
  it("keeps sending disabled and dry-run by default", () => {
    expect(template).toMatch(/ScheduleState:\n\s+Type: String\n\s+Default: DISABLED/);
    expect(template).toMatch(/RunMode:\n\s+Type: String\n\s+Default: DRY_RUN/);
    expect(template).toMatch(
      /ReservedConcurrency:\n\s+Type: Number\n\s+Default: 0\n\s+MinValue: 0\n\s+MaxValue: 10\n\s+AllowedValues: \[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10\]/,
    );
    expect(template).toContain("UseReservedConcurrency: !Not [!Equals [!Ref ReservedConcurrency, 0]]");
    expect(template).toMatch(
      /ReservedConcurrentExecutions: !If\n\s+- UseReservedConcurrency\n\s+- !Ref ReservedConcurrency\n\s+- !Ref AWS::NoValue/,
    );
    expect(template).toMatch(/AllowedTelegramChatId:\n\s+Type: String\n\s+Default: '0'/);
    expect(template).toContain("Action: ses:GetAccount");
    expect(template).toMatch(/Globals:\n  Function:\n(?:    [^\n]*\n)*    Timeout: 120/);
  });

  it("grants both SES send actions only on the approved identity and configuration set", () => {
    const policyStart = template.indexOf("PolicyName: OrchestratorRuntimeAccess");
    const functionStart = template.indexOf("  SalesReactivationFunction:");
    expect(policyStart).toBeGreaterThanOrEqual(0);
    expect(functionStart).toBeGreaterThan(policyStart);
    const policy = template.slice(policyStart, functionStart);
    const actionIndex = policy.indexOf("- ses:SendEmail");
    const statementStart = policy.lastIndexOf("              - Effect:", actionIndex);
    const nextStatement = policy.indexOf("\n              - Effect:", actionIndex);
    expect(actionIndex).toBeGreaterThanOrEqual(0);
    expect(statementStart).toBeGreaterThanOrEqual(0);
    expect(nextStatement).toBeGreaterThan(actionIndex);
    const sendStatement = policy.slice(statementStart, nextStatement);
    const normalizedStatement = sendStatement.replace(/^ {14}/gm, "").trim();
    expect(normalizedStatement).toBe([
      "- Effect: Allow",
      "  Action:",
      "    - ses:SendEmail",
      "    - ses:SendRawEmail",
      "  Resource:",
      "    - !Ref SesIdentityArn",
      "    - !Sub arn:${AWS::Partition}:ses:${AWS::Region}:${AWS::AccountId}:configuration-set/${SesConfigurationSetName}",
    ].join("\n"));
  });

  it("routes only approved SES events through an authenticated API destination", () => {
    const ruleStart = template.indexOf("  SesEventsRule:");
    const ruleEnd = template.indexOf("  SesEventsDlqPolicy:");
    expect(ruleStart).toBeGreaterThanOrEqual(0);
    expect(ruleEnd).toBeGreaterThan(ruleStart);
    const rule = template.slice(ruleStart, ruleEnd);
    expect(template).toContain("Type: AWS::SES::ConfigurationSetEventDestination");
    expect(template).toContain("Type: AWS::Events::ApiDestination");
    expect(template).toContain("ApiKeyName: x-rh-webhook-secret");
    expect(template).toContain("SecretString:sesEventsWebhookSecret");
    expect(rule).toContain("'ses:configuration-set':");
    expect(rule).toContain("- !Ref SesSenderAddress");
    expect(rule).not.toContain("resources:");
    expect(rule).toContain("State: ENABLED");
  });

  it("enables high-confidence SES auto validation without dropping bounce and complaint suppression", () => {
    expect(template).toMatch(
      /SuppressionOptions:\n\s+SuppressedReasons:\n\s+- BOUNCE\n\s+- COMPLAINT\n\s+ValidationOptions:\n\s+ConditionThreshold:\n\s+ConditionThresholdEnabled: ENABLED\n\s+OverallConfidenceThreshold:\n\s+ConfidenceVerdictThreshold: HIGH/,
    );
    expect(template).toContain("          - bounce");
  });

  it("retains failed SES events in a protected DLQ", () => {
    expect(template).toContain("SesEventsDlq:");
    expect(template).toContain("DeletionPolicy: Retain");
    expect(template).toContain("AllowEventBridgeTargetFailures");
    expect(template).toContain("MaximumRetryAttempts: 3");
    expect(template).toContain("SesEventsDlqAlarm:");
  });
});
