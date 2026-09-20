import { PROSPECTING_SUBJECTS, REACTIVATION_COURSES } from "@/features/sales/reactivation/types";
import type {
  EligibilityDecision,
  ReactivationCampaignState,
  ReactivationCandidate,
  ReactivationControl,
  ReactivationReasonCode,
} from "@/features/sales/reactivation/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hourInTimezone(now: Date, timezone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(now);
  return Number(hour) % 24;
}

export function evaluateReactivationEligibility(input: {
  candidate: ReactivationCandidate;
  campaign: ReactivationCampaignState;
  control: ReactivationControl;
  now: Date;
}): EligibilityDecision {
  const { candidate, campaign, control, now } = input;
  const reasons: ReactivationReasonCode[] = [];

  if (!control.dryRun) {
    if (!control.enabled) reasons.push("AUTOMATION_DISABLED");
    if (control.killSwitch) reasons.push("GLOBAL_KILL_SWITCH");
    if (campaign.status !== "ACTIVE") reasons.push("CAMPAIGN_INACTIVE");
  } else if (campaign.status === "PAUSED") {
    reasons.push("CAMPAIGN_INACTIVE");
  }
  if (campaign.contentStatus !== "APPROVED") reasons.push("CONTENT_NOT_APPROVED");
  if (candidate.deletedAt) reasons.push("LEAD_DELETED");
  if (!candidate.email) reasons.push("EMAIL_MISSING");
  else if (!EMAIL_PATTERN.test(candidate.email)) reasons.push("EMAIL_INVALID");

  if (!candidate.permission) reasons.push("PERMISSION_MISSING");
  else {
    if (candidate.permission.status === "BLOCKED") reasons.push("PERMISSION_BLOCKED");
    if (candidate.permission.status !== "APPROVED" && candidate.permission.status !== "BLOCKED") reasons.push("PERMISSION_MISSING");
    if (candidate.permission.purpose !== campaign.permissionPurpose) reasons.push("PURPOSE_MISMATCH");
    if (candidate.permission.expiresAt && Date.parse(candidate.permission.expiresAt) <= now.getTime()) reasons.push("PERMISSION_EXPIRED");
  }

  if (candidate.suppressed) reasons.push("SUPPRESSED");
  if (candidate.hasActiveSequence) reasons.push("ACTIVE_SEQUENCE_EXISTS");
  if (candidate.hasCampaignSequence && !candidate.hasActiveSequence) reasons.push("CAMPAIGN_ALREADY_PROCESSED");
  const approvedSubjects = campaign.permissionPurpose === "COMMERCIAL_PROSPECTING"
    ? PROSPECTING_SUBJECTS
    : REACTIVATION_COURSES;
  if (!candidate.course || !approvedSubjects.some((course) => course === candidate.course)) {
    reasons.push("COURSE_NOT_APPROVED");
  }

  if (campaign.permissionPurpose === "COMMERCIAL_REACTIVATION" && candidate.lastInteractionAt) {
    const inactiveForMs = now.getTime() - Date.parse(candidate.lastInteractionAt);
    if (!Number.isFinite(inactiveForMs) || inactiveForMs < candidate.minimumInactivityDays * 86_400_000) {
      reasons.push("RECENT_INTERACTION");
    }
  }

  if (!control.dryRun) {
    const currentHour = hourInTimezone(now, control.timezone);
    if (currentHour < control.sendWindowStart || currentHour >= control.sendWindowEnd) reasons.push("OUTSIDE_SEND_WINDOW");
    if (control.sentToday >= control.dailyLimit) reasons.push("DAILY_LIMIT_REACHED");
  }

  if (reasons.length) {
    return { eligible: false, mode: "BLOCKED", reasonCodes: Array.from(new Set(reasons)) };
  }
  if (control.dryRun) return { eligible: true, mode: "DRY_RUN", reasonCodes: ["DRY_RUN_ONLY"] };
  return { eligible: true, mode: "LIVE", reasonCodes: ["ELIGIBLE"] };
}
