import { render } from "@react-email/render";
import { Resend } from "resend";
import { createHash } from "node:crypto";

import { WaitlistWelcomeEmail } from "@/emails/waitlist-welcome";

/** Confirmation email sent after a signup row is created.
 *
 *  Entirely optional: with no RESEND_API_KEY this returns `skipped_config` and
 *  the signup still succeeds. Branding comes from env so the copy can be set
 *  without touching code. */

export type SendWaitlistConfirmationEmailResult =
  | { status: "sent"; from: string; to: string; providerId: string | null }
  | { status: "skipped_config"; reason: "missing_api_key" }
  | { status: "skipped_quota"; reason: string };

function getResendApiKey() {
  return process.env.RESEND_API_KEY?.trim() || null;
}

function getFromEmail() {
  // Resend's shared test sender — works without a verified domain.
  return process.env.RESEND_FROM_EMAIL?.trim() || "onboarding@resend.dev";
}

/** Doubles as the product name in the subject and body. */
function getBrandName() {
  return process.env.RESEND_FROM_NAME?.trim() || "Icon Space";
}

function getReplyToEmail() {
  return process.env.RESEND_REPLY_TO_EMAIL?.trim() || null;
}

function buildTextMessage(email: string, brand: string) {
  return [
    "Hi there,",
    "",
    `Thanks for joining the ${brand} waitlist.`,
    "",
    `We received your signup for ${email}.`,
    "We will email you as soon as access opens.",
    "",
    `- ${brand} Team`,
  ].join("\n");
}

export async function sendWaitlistConfirmationEmail(
  email: string,
): Promise<SendWaitlistConfirmationEmailResult> {
  email = email.trim().toLowerCase();
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return { status: "skipped_config", reason: "missing_api_key" };
  }

  const fromEmail = getFromEmail();
  const brand = getBrandName();
  const replyToEmail = getReplyToEmail();

  const resend = new Resend(apiKey);

  const html = await render(WaitlistWelcomeEmail({ brand }));

  // Shared by signup + cron + CLI, including rows on fallback databases.
  // Resend retains this key for 24h; the DB remains the long-term sent ledger.
  const requestOptions = {
    idempotencyKey: `waitlist-confirmation/${createHash("sha256").update(email.trim().toLowerCase()).digest("hex")}`,
    // The installed SDK forwards request options to fetch. Bound a provider
    // outage so the cron has time to persist its result before Vercel's limit.
    signal: AbortSignal.timeout(20_000),
  };
  const { data, error } = await resend.emails.send(
    {
      from: `${brand} <${fromEmail}>`,
      to: email,
      ...(replyToEmail ? { replyTo: replyToEmail } : {}),
      subject: `You are on the ${brand} waitlist`,
      html,
      text: buildTextMessage(email, brand),
    },
    requestOptions,
  );

  if (error) {
    const message = error.message ?? "Unknown error";
    const normalizedMessage = message.toLowerCase();

    // Quota/rate errors are expected and recoverable — record them on the row
    // rather than throwing, so they don't read as a broken signup.
    const isQuota =
      error.statusCode === 429 ||
      [
        "daily_quota_exceeded",
        "monthly_quota_exceeded",
        "rate_limit_exceeded",
      ].includes(error.name) ||
      normalizedMessage.includes("quota") ||
      normalizedMessage.includes("rate limit") ||
      normalizedMessage.includes("too many requests") ||
      normalizedMessage.includes("sending limit");

    if (isQuota) {
      return {
        status: "skipped_quota",
        reason: `Resend: ${message}`.slice(0, 300),
      };
    }

    throw new Error(`Resend request failed: ${message}`);
  }

  if (!data?.id)
    throw new Error("Resend did not return a delivery identifier.");

  return {
    status: "sent",
    from: fromEmail,
    to: email,
    providerId: data?.id ?? null,
  };
}
