import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { Button } from "@/components/ui/button";
import { parseLinks } from "@/lib/profile/schema";
import { avatarUrl } from "@/lib/profile/server";

import { loadProfile } from "../profile-data";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Edit profile · Tessera" };

export default async function EditProfilePage({
  params,
}: PageProps<"/u/[handle]/edit">) {
  const { supabase, userId, profile } = await loadProfile(
    (await params).handle,
  );
  // Only the owner edits a profile (RLS rejects anyone else's update anyway).
  if (!profile?.handle || profile.id !== userId) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader handle={profile.handle} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            Edit profile
          </h1>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/u/${profile.handle}`}>Cancel</Link>
          </Button>
        </div>
        <ProfileForm
          userId={userId}
          handle={profile.handle}
          initial={{
            displayName: profile.display_name ?? "",
            discipline: profile.discipline,
            bio: profile.bio ?? "",
            skills: profile.skills,
            links: parseLinks(profile.links),
            avatarPath: profile.avatar_path,
            avatarUrl: await avatarUrl(supabase, profile.avatar_path),
          }}
        />
      </main>
    </div>
  );
}
