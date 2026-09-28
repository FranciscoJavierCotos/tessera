"use client";

import { CircleAlert, Loader2, MailCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  signInWithGitHub,
  signInWithPassword,
  type PasswordSignInState,
} from "@/app/auth/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type AuthMode,
} from "@/lib/auth/credentials";

function GitHubMark() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className="size-4">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function SubmitButton({
  children,
  pendingLabel,
  variant,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: "default" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      className="w-full"
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? (
        <>
          <Loader2 aria-hidden className="animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

const idle: PasswordSignInState = { status: "idle" };

export function SignInForm({ next }: { next: string }) {
  const [state, passwordAction] = useActionState(signInWithPassword, idle);
  const [mode, setMode] = useState<AuthMode>(
    state.status === "error" ? state.mode : "sign-in",
  );
  const signingUp = mode === "sign-up";

  if (state.status === "confirm") {
    return (
      <Alert>
        <MailCheck aria-hidden />
        <AlertTitle>Confirm your email</AlertTitle>
        <AlertDescription>
          We sent a confirmation link to <strong>{state.email}</strong>. Open it
          to finish creating your account, then sign in with your password.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      {state.status === "error" && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>{state.title}</AlertTitle>
          <AlertDescription>{state.description}</AlertDescription>
        </Alert>
      )}

      <form action={signInWithGitHub}>
        <input type="hidden" name="next" value={next} />
        <SubmitButton variant="outline" pendingLabel="Redirecting to GitHub�">
          <GitHubMark />
          Continue with GitHub
        </SubmitButton>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={passwordAction} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="mode" value={mode} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            defaultValue={state.status === "error" ? state.email : undefined}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={signingUp ? "new-password" : "current-password"}
            minLength={signingUp ? PASSWORD_MIN_LENGTH : undefined}
            maxLength={PASSWORD_MAX_LENGTH}
            aria-describedby={signingUp ? "password-hint" : undefined}
            required
          />
          {signingUp && (
            <p id="password-hint" className="text-xs text-muted-foreground">
              At least {PASSWORD_MIN_LENGTH} characters.
            </p>
          )}
        </div>
        {signingUp ? (
          <SubmitButton pendingLabel="Creating account�">
            Create account
          </SubmitButton>
        ) : (
          <SubmitButton pendingLabel="Signing in�">Sign in</SubmitButton>
        )}
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {signingUp ? "Already have an account?" : "New to Tessera?"}{" "}
        <button
          type="button"
          onClick={() => setMode(signingUp ? "sign-in" : "sign-up")}
          className="rounded-sm font-medium text-foreground underline underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {signingUp ? "Sign in" : "Create an account"}
        </button>
      </p>
    </>
  );
}
