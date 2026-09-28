export type AuthErrorCopy = { title: string; description: string };

const COPY = {
  invalid_credentials: {
    title: "Wrong email or password",
    description:
      "Check the email address and password and try again. Passwords are case-sensitive.",
  },
  email_not_confirmed: {
    title: "Confirm your email first",
    description:
      "Open the confirmation email we sent when you created the account, then sign in.",
  },
  user_exists: {
    title: "An account with this email already exists",
    description: "Sign in with your password instead of creating an account.",
  },
  weak_password: {
    title: "Choose a stronger password",
    description:
      "Use at least 8 characters and avoid common or previously leaked passwords.",
  },
  link_expired: {
    title: "This sign-in link has expired",
    description:
      "Confirmation and sign-in links work once and expire after an hour. Sign in again to continue.",
  },
  oauth_denied: {
    title: "GitHub sign-in was cancelled",
    description:
      "GitHub did not share your account with Tessera. Try again and choose Authorize, or sign in with your email and password instead.",
  },
  rate_limited: {
    title: "Too many sign-in attempts",
    description:
      "We received several attempts for this account recently. Wait a few minutes, then try again.",
  },
  unknown: {
    title: "We couldn't sign you in",
    description:
      "Something went wrong on our side or the request was incomplete. Try signing in again.",
  },
} satisfies Record<string, AuthErrorCopy>;

export type AuthErrorCode = keyof typeof COPY;

/**
 * Maps a Supabase Auth / OAuth error code (from a redirect's `error_code` or
 * `error`, or from an `AuthError.code`) to one of our plain-language cases.
 */
export function toAuthErrorCode(raw: string | null | undefined): AuthErrorCode {
  switch (raw) {
    case "invalid_credentials":
      return "invalid_credentials";
    case "email_not_confirmed":
      return "email_not_confirmed";
    case "user_already_exists":
    case "email_exists":
    case "user_exists":
      return "user_exists";
    case "weak_password":
      return "weak_password";
    case "otp_expired":
    case "flow_state_expired":
    case "flow_state_not_found":
    case "bad_code_verifier":
    case "link_expired":
      return "link_expired";
    case "access_denied":
    case "oauth_denied":
      return "oauth_denied";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
    case "rate_limited":
      return "rate_limited";
    default:
      return "unknown";
  }
}

export function authErrorCopy(code: AuthErrorCode): AuthErrorCopy {
  return COPY[code];
}

/**
 * Picks the most specific code from a provider redirect. Supabase sends
 * `error=access_denied` both for a cancelled OAuth consent and, with
 * `error_code=otp_expired`, for an expired email link, so `error_code` wins.
 */
export function authErrorFromParams(params: {
  get(name: string): string | null;
}): AuthErrorCode {
  const specific = toAuthErrorCode(params.get("error_code"));
  return specific === "unknown"
    ? toAuthErrorCode(params.get("error"))
    : specific;
}
