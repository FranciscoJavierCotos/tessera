"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { fieldErrors, type FormState } from "@/lib/forms";
import { isOwnAvatarPath, profileEditSchema } from "@/lib/profile/schema";
import { requireUser } from "@/lib/profile/server";

function strings(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .map((value) => (typeof value === "string" ? value : ""));
}

/** Pairs the `linkLabel[]`/`linkUrl[]` inputs, dropping fully blank rows. */
function readLinks(formData: FormData) {
  const labels = strings(formData, "linkLabel");
  const urls = strings(formData, "linkUrl");
  return labels
    .map((label, index) => ({ label, url: urls[index] ?? "" }))
    .filter(({ label, url }) => label.trim() || url.trim());
}

/** Saves the signed-in user's own profile (RLS restricts updates to self). */
export async function updateProfile(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const avatarPath = formData.get("avatarPath");
  const input = profileEditSchema.safeParse({
    displayName: formData.get("displayName"),
    discipline: formData.get("discipline"),
    bio: formData.get("bio") ?? "",
    skills: strings(formData, "skills"),
    links: readLinks(formData),
    avatarPath:
      typeof avatarPath === "string" && avatarPath ? avatarPath : null,
  });
  if (!input.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(input.error),
    };
  }

  const { supabase, userId } = await requireUser();
  const data = input.data;
  if (data.avatarPath && !isOwnAvatarPath(data.avatarPath, userId)) {
    return { status: "error", fieldErrors: { avatarPath: "Upload again." } };
  }

  const { data: saved, error } = await supabase
    .from("profiles")
    .update({
      display_name: data.displayName,
      discipline: data.discipline,
      bio: data.bio || null,
      skills: data.skills,
      links: data.links,
      avatar_path: data.avatarPath,
    })
    .eq("id", userId)
    .select("handle")
    .single();
  if (error || !saved.handle) {
    return { status: "error", message: "Could not save. Try again." };
  }

  await removeStaleAvatars(supabase, userId, data.avatarPath);

  revalidatePath(`/u/${saved.handle}`);
  redirect(`/u/${saved.handle}`);
}

/**
 * Deletes the user's avatar objects other than `keep` (replaced avatars and
 * uploads abandoned before saving). Best effort: a failure leaves orphans.
 */
async function removeStaleAvatars(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  keep: string | null,
) {
  const { data: files } = await supabase.storage
    .from("avatars")
    .list(userId, { limit: 100 });
  const stale = (files ?? [])
    .map((file) => `${userId}/${file.name}`)
    .filter((path) => path !== keep);
  if (stale.length) await supabase.storage.from("avatars").remove(stale);
}
