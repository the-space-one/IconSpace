import {
  AllDatabasesUnavailableError,
  getSafeErrorSummary,
  insertWaitlistWithFailover,
  updateEmailSendStatusById,
} from "@/db/router";
import { getRateLimitKey, isRequestOriginAllowed } from "@/server/request-meta";
import { checkIpRateLimit } from "@/server/rate-limit";
import { sendWaitlistConfirmationEmail } from "@/server/waitlist-email";
import { appendWaitlistRowToSheet } from "@/server/waitlist-sheet";
import { WAITLIST_COUNT_CACHE_TAG } from "@/server/waitlist-count";
import { findSentConfirmation } from "@/db/replica-delivery";
import { mirrorSubscriber } from "@/server/waitlist-mirror";
import { revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";

// node:crypto, node:https and the Redis socket all need the Node runtime.
export const runtime = "nodejs";
export const maxDuration = 300;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_REQUEST_BODY_BYTES = 1024;

function isJsonContentType(request: Request) {
  const raw = request.headers.get("content-type") ?? "";
  return raw.toLowerCase().startsWith("application/json");
}

function isPayloadTooLarge(request: Request, rawBody: string) {
  const declaredLength = Number.parseInt(
    request.headers.get("content-length") ?? "",
    10,
  );
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_REQUEST_BODY_BYTES
  ) {
    return true;
  }

  return Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BODY_BYTES;
}

/** Errors get persisted on the subscriber row, so strip anything that looks
 *  like an email address and cap the length before storing. */
function summarizeErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  const firstLine = raw.split("\n")[0] ?? "Unknown error";
  const summarized = firstLine
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .slice(0, 400);
  return summarized || "Unknown error";
}

export async function POST(request: Request) {
  if (
    process.env.NODE_ENV === "production" &&
    !isRequestOriginAllowed(request)
  ) {
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403 },
    );
  }

  const rateLimit = await checkIpRateLimit(getRateLimitKey(request.headers));
  if (!rateLimit.allowed) {
    if (rateLimit.reason === "limiter_unavailable") {
      return NextResponse.json(
        {
          error: "Signup is temporarily unavailable. Please retry in a moment.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "Too many signup attempts. Please retry in a moment." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  if (!isJsonContentType(request)) {
    return NextResponse.json(
      { error: "Content-Type must be application/json." },
      { status: 415 },
    );
  }

  let email = "";
  let rawBody = "";

  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  if (isPayloadTooLarge(request, rawBody)) {
    return NextResponse.json(
      { error: "Request payload is too large." },
      { status: 413 },
    );
  }

  try {
    const body = JSON.parse(rawBody || "{}") as { email?: string };
    email = body.email?.trim().toLowerCase() ?? "";
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  if (email.length > 320) {
    return NextResponse.json(
      { error: "Please enter a valid email." },
      { status: 400 },
    );
  }

  if (!emailRegex.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email." },
      { status: 400 },
    );
  }

  try {
    const insertResult = await insertWaitlistWithFailover(email);
    const { status, source } = insertResult;
    console.info("waitlist_write_source", { source, status });

    // Runs for new AND repeat signups, after delivery bookkeeping has settled.
    // If this work is interrupted, the scheduled sweep repairs from saved rows.
    after(async () => {
      try {
        await mirrorSubscriber(email);
      } catch {
        console.error("waitlist_mirror_error");
      }
    });

    // Only a brand-new row triggers the count bust and the welcome email;
    // a repeat signup should stay a silent no-op.
    if (insertResult.status === "created") {
      revalidateTag(WAITLIST_COUNT_CACHE_TAG, "max");

      // Backup copy into Google Sheets. Deferred past the response so a slow or
      // down webhook costs the signup nothing, and swallowed so it can never
      // turn a saved row into an error for the user.
      const { subscriberId } = insertResult;
      after(async () => {
        try {
          const sheetResult = await appendWaitlistRowToSheet({
            email,
            subscriberId,
            source,
          });

          if (sheetResult.status === "failed") {
            console.error("waitlist_sheet_append_failed", {
              subscriberId,
              reason: sheetResult.reason,
            });
          } else if (sheetResult.status === "appended") {
            console.info("waitlist_sheet_appended", { subscriberId });
          }
        } catch (error) {
          console.error("waitlist_sheet_append_error", {
            subscriberId,
            message: summarizeErrorMessage(error),
          });
        }
      });

      let emailStatus: "sent" | "failed" | "skipped_quota" | "skipped_config" =
        "failed";
      let emailError: string | undefined;
      let emailSentAt: Date | undefined;

      try {
        // During failover this recipient may already have been confirmed on a
        // different database. Unknown history deliberately defers delivery.
        const confirmed = await findSentConfirmation(email);
        const emailResult = confirmed
          ? null
          : await sendWaitlistConfirmationEmail(email);
        if (confirmed) {
          emailStatus = "sent";
          emailSentAt = confirmed.emailSentAt ?? undefined;
        } else if (emailResult?.status === "sent") {
          emailStatus = "sent";
          emailSentAt = new Date();
          console.info("waitlist_confirmation_email_sent", {
            provider: "resend",
            providerId: emailResult.providerId,
          });
        } else if (emailResult?.status === "skipped_quota") {
          emailStatus = "skipped_quota";
          emailError = summarizeErrorMessage(emailResult.reason);
          console.warn("waitlist_confirmation_email_skipped_quota", {
            code: "quota_or_rate_limit",
          });
        } else {
          emailStatus = "skipped_config";
          console.info("waitlist_confirmation_email_skipped_config", {
            provider: "resend",
            reason: emailResult?.reason,
          });
        }
      } catch (error) {
        emailStatus = "failed";
        emailError = summarizeErrorMessage(error);
        console.error("waitlist_confirmation_email_error", {
          ...getSafeErrorSummary(error),
          message: emailError,
        });
      }

      await updateEmailSendStatusById({
        subscriberId: insertResult.subscriberId,
        targetKey: insertResult.targetKey,
        status: emailStatus,
        error: emailError,
        sentAt: emailSentAt,
      });
    }

    return NextResponse.json({ status }, { status: 200 });
  } catch (error) {
    if (error instanceof AllDatabasesUnavailableError) {
      return NextResponse.json(
        {
          error: "Signup is temporarily unavailable. Please retry in a moment.",
        },
        { status: 503 },
      );
    }

    console.error("waitlist_insert_error", getSafeErrorSummary(error));
    return NextResponse.json(
      { error: "Could not save your email." },
      { status: 500 },
    );
  }
}
