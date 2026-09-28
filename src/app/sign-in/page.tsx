import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { safeNextPath } from "@/lib/auth/redirect";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Tessera" };

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const { next } = await searchParams;

  return (
    <AuthShell
      title="Sign in to Tessera"
      description="Sign in with GitHub or your email and password."
    >
      <SignInForm next={safeNextPath(next)} />
    </AuthShell>
  );
}
