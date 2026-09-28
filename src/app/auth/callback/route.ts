import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { authErrorFromParams, toAuthErrorCode } from "@/lib/auth/errors";
import { safeNextPath } from "@/lib/auth/redirect";
import { createServerClient } from "@/lib/supabase/server";

// Email links Supabase still sends (sign-up confirmation, invites, email
// changes). Magic-link sign-in is not offered.
const emailOtpTypes = [
  "signup",
  "invite",
  "recovery",
  "email_change",
  "email",
] as const satisfies readonly EmailOtpType[];

const callbackParams = z.union([
  // OAuth and email links started in this browser (PKCE).
  z.object({ code: z.string().min(1) }),
  // Email links verified by token hash (custom email templates).
  z.object({
    token_hash: z.string().min(1),
    type: z.enum(emailOtpTypes),
  }),
]);

function errorRedirect(request: NextRequest, code: string) {
  return NextResponse.redirect(
    new URL(`/auth/error?code=${encodeURIComponent(code)}`, request.url),
  );
}

/**
 * Completes a sign-in: exchanges the PKCE `code` (or verifies a `token_hash`)
 * for a session cookie, then redirects to the same-origin `next` path.
 * Provider errors (`?error=…&error_code=…`) go to `/auth/error`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));

  if (searchParams.has("error") || searchParams.has("error_code")) {
    return errorRedirect(request, authErrorFromParams(searchParams));
  }

  const params = callbackParams.safeParse(Object.fromEntries(searchParams));
  if (!params.success) return errorRedirect(request, "unknown");

  const supabase = await createServerClient();
  const { error } =
    "code" in params.data
      ? await supabase.auth.exchangeCodeForSession(params.data.code)
      : await supabase.auth.verifyOtp({
          token_hash: params.data.token_hash,
          type: params.data.type,
        });

  if (error) return errorRedirect(request, toAuthErrorCode(error.code));

  return NextResponse.redirect(new URL(next, request.url));
}
