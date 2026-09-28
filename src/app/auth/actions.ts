"use server";

import { redirect } from "next/navigation";

import { env } from "@/env";
import { credentialsInput, type AuthMode } from "@/lib/auth/credentials";
import { authErrorCopy, toAuthErrorCode } from "@/lib/auth/errors";
import { onboardingPath, safeNextPath } from "@/lib/auth/redirect";
import { isOnboardingPath } from "@/lib/auth/routes";
import { isOnboarded } from "@/lib/supabase/proxy";
import { createServerClient } from "@/lib/supabase/server";

export type PasswordSignInState =
  | { status: "idle" }
  | { status: "confirm"; email: string }
  | {
      status: "error";
      title: string;
      description: string;
      email?: string;
      mode: AuthMode;
    };

function callbackUrl(next: string) {
  const url = new URL("/auth/callback", env.NEXT_PUBLIC_SITE_URL);
  url.searchParams.set("next", next);
  return url.toString();
}

/**
 * Signs in with email + password, or creates the account when `mode` is
 * `sign-up`. On success redirects to the same-origin `next` path (through
 * onboarding for users who have not finished it). If the
 * project requires email confirmation, a new account gets `confirm` instead.
 */
export async function signInWithPassword(
  _previous: PasswordSignInState,
  formData: FormData,
): Promise<PasswordSignInState> {
  const mode: AuthMode =
    formData.get("mode") === "sign-up" ? "sign-up" : "sign-in";
  const input = credentialsInput.safeParse({
    mode,
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!input.success) {
    const email = formData.get("email");
    return {
      status: "error",
      mode,
      email: typeof email === "string" ? email : undefined,
      title:
        mode === "sign-up"
          ? "Check your details"
          : "Check your email and password",
      description: input.error.issues[0]?.message ?? "Check the form.",
    };
  }

  const { email, password } = input.data;
  const next = safeNextPath(input.data.next);
  const supabase = await createServerClient();

  const { data, error } =
    input.data.mode === "sign-up"
      ? await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: callbackUrl(next) },
        })
      : await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return {
      status: "error",
      mode,
      email,
      ...authErrorCopy(toAuthErrorCode(error.code)),
    };
  }
  if (!data.session) return { status: "confirm", email };

  // The proxy does not run for a Server Action's redirect target (it renders
  // in the same response), so apply its onboarding guard here.
  const onboarded = await isOnboarded(supabase, data.session.user.id);
  redirect(onboarded || isOnboardingPath(next) ? next : onboardingPath(next));
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
