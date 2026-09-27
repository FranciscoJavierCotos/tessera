export type AuthErrorCopy = { title: string; description: string };

const COPY = {
  link_expired: {
    title: "This sign-in link has expired",
    description:
      "Sign-in links work once and expire after an hour. Request a new one and use the latest email.",
  },
  oauth_denied: {
    title: "GitHub sign-in was cancelled",
    description:
      "GitHub did not share your account with Tessera. Try again and choose Authorize, or use an email link instead.",
  },
  rate_limited: {
    title: "Too many sign-in emails",
    description:
      "We have sent several emails to this address recently. Wait a few minutes, then request a new link.",
  },
  unknown: {
    title: "We couldn't sign you in",
    description:
      "Something went wrong on our side or the link was incomplete. Try signing in again.",
  },
} satisfies Record<string, AuthErrorCopy>;

export type AuthErrorCode = keyof typeof COPY;

/**
 * Maps a Supabase Auth / OAuth error code (from a redirect's `error_code` or
 * `error`, or from an `AuthError.code`) to one of our plain-language cases.
 */
export function toAuthErrorCode(raw: string | null | undefined): AuthErrorCode {
  switch (raw) {
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
