"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { MascotPeek } from "@/components/mascot";

type WaitlistApiResponse = {
  error?: string;
  status?: "created" | "exists";
};

// Mirrors the server-side check in src/app/api/waitlist/route.ts so obvious
// typos are caught before a round trip. The server stays the real gate.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success">("idle");
  const [isLoading, setIsLoading] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  function showSuccess() {
    setEmail("");
    setStatus("success");

    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setStatus("idle"), 2200);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading || status === "success") return;

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      toast.error("Please enter an email address.");
      return;
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    try {
      setIsLoading(true);

      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      const data = (await response
        .json()
        .catch(() => null)) as WaitlistApiResponse | null;

      if (!response.ok) {
        // The route returns a human-readable reason for 400/413/429/503.
        toast.error(data?.error ?? "Could not join the waitlist.");
        return;
      }

      if (data?.status === "exists") {
        toast.message("You're already on the waitlist.", {
          description: "That email is already saved. :D",
        });
        setEmail("");
        return;
      }

      if (data?.status === "created") {
        toast.success("You're on the waitlist!", {
          description: "One tasteful launch mail, incoming. :D",
        });
        showSuccess();
        return;
      }

      toast.error("Could not join the waitlist.");
    } catch (error) {
      console.error("waitlist_submit_error", error);
      toast.error("Could not join the waitlist.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
    >
      {/* Email field */}
      <div className="flex w-full flex-col gap-1.5 opacity-80 transition-opacity focus-within:opacity-100 sm:w-[373px]">
        <label
          htmlFor="waitlist-email"
          className="font-display text-xs font-bold text-foreground"
        >
          Email<span className="text-[#ef4444]">*</span>
        </label>

        <div className="relative flex h-[42px] items-center gap-1.5 rounded-[8px] border border-[#e0e0e0] bg-[#f2f2f2] px-3 py-1 dark:border-input dark:bg-input/30">
          <Search
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <input
            id="waitlist-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            spellCheck={false}
            disabled={isLoading}
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-w-0 flex-1 bg-transparent font-display text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
          />
        </div>

        <p className="font-description text-[10px] leading-none text-muted-foreground">
          Not gonna spam, Just one tasteful launch mail :D
        </p>
      </div>

      {/* Submit */}
      <div className="cta-slot w-full sm:w-[108px] sm:pt-1">
        {/* `isolate` keeps the mascot's z-index local, so it can never slide
            out from behind a neighbouring element instead of the button. */}
        <div className="cta relative isolate">
          <div className="cta__visual relative isolate">
          {/* Base CSS anchors the fully visible peek underneath the button.
              This wrapper moves with the button on press; only the cat's head
              leans on hover, leaving its paw and cut edge connected. */}
          <span className="cta-cat-anchor pointer-events-none absolute top-1/2 z-0" aria-hidden="true">
            <MascotPeek className="cta-cat block h-9 w-auto overflow-visible" />
          </span>

          <Button
            type="submit"
            aria-live="polite"
            aria-busy={isLoading}
            disabled={isLoading}
            className="cta__button relative z-10 h-10 w-full cursor-pointer rounded-[8px] border-[#6b6fff] bg-[#9fa1ff] px-4 py-2 font-display text-sm font-medium text-[#fafafa] shadow-[inset_0_0_0_2px_#8d8fff] transition-[background-color,opacity,box-shadow] duration-200 hover:bg-[#8d8fff] disabled:opacity-70"
          >
            {status === "success" ? (
              <span className="inline-flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-300 ease-out motion-reduce:animate-none">
                <Check className="size-4" strokeWidth={3} aria-hidden />
                You&apos;re in!
              </span>
            ) : isLoading ? (
              "Joining…"
            ) : (
              "Join Waitlist"
            )}
          </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
