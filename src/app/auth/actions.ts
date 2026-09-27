"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { env } from "@/env";
import { authErrorCopy, toAuthErrorCode } from "@/lib/auth/errors";
import { safeNextPath } from "@/lib/auth/redirect";
import { createServerClient } from "@/lib/supabase/server";

export type EmailSignInState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; title: string; description: string; email?: string };

const emailSignInInput = z.object({
  email: z.email({ error: "Enter a valid email address." }).trim(),
  next: z.string().optional(),
});

function callbackUrl(next: string) {
  const url = new URL("/auth/callback", env.NEXT_PUBLIC_SITE_URL);
  url.searchParams.set("next", next);
  return url.toString();
}

/** Sends a magic link. New emails get an account on first sign-in. */
export async function signInWithEmail(
  _previous: EmailSignInState,
  formData: FormData,
): Promise<EmailSignInState> {
  const input = emailSignInInput.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
  });
  if (!input.success) {
    return {
      status: "error",
      title: "Check your email address",
      description: input.error.issues[0]?.message ?? "Enter a valid email.",
    };
  }

  const { email } = input.data;
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl(safeNextPath(input.data.next)) },
  });

  if (error) {
    return {
      status: "error",
      email,
      ...authErrorCopy(toAuthErrorCode(error.code)),
    };
  }
  return { status: "sent", email };
}

/** Starts the GitHub OAuth flow (PKCE) and redirects to GitHub. */
export async function signInWithGitHub(formData: FormData) {
  const next = safeNextPath(formData.get("next"));
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: callbackUrl(next) },
  });

  if (error || !data.url) {
    redirect(`/auth/error?code=${toAuthErrorCode(error?.code)}`);
  }
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
