import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { authErrorCopy, toAuthErrorCode } from "@/lib/auth/errors";

export const metadata: Metadata = { title: "Sign-in problem · Tessera" };

export default async function AuthErrorPage({
  searchParams,
}: PageProps<"/auth/error">) {
  const { code } = await searchParams;
  const copy = authErrorCopy(
    toAuthErrorCode(typeof code === "string" ? code : null),
  );

  return (
    <AuthShell title={copy.title} description={copy.description}>
      <Button asChild className="w-full">
        <Link href="/sign-in">Back to sign in</Link>
      </Button>
    </AuthShell>
  );
}
