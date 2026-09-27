import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";

import { CreateWorkspaceForm } from "./create-workspace-form";

export const metadata: Metadata = { title: "Create a workspace · Tessera" };

export default function NewWorkspacePage() {
  return (
    <AuthShell
      title="Create a workspace"
      description="A home for your team's data work. You become its owner and can invite people next."
    >
      <CreateWorkspaceForm />
    </AuthShell>
  );
}
