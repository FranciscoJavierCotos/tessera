"use client";

import { Loader2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { FieldError } from "@/components/form/field-error";
import { Button } from "@/components/ui/button";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  AVATAR_TYPES,
  avatarFileError,
  newAvatarPath,
} from "@/lib/profile/schema";

import { ProfileAvatar } from "./profile-avatar";

/**
 * Uploads the avatar straight to the private `avatars` bucket (RLS: owner
 * writes `<user_id>/…`) and submits the object path as `avatarPath`. Saving
 * the form points the profile at it and removes the previous file.
 */
export function AvatarField({
  userId,
  name,
  defaultPath,
  defaultUrl,
  serverError,
}: {
  userId: string;
  name: string;
  defaultPath: string | null;
  defaultUrl: string | null;
  serverError?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState(defaultPath);
  const [preview, setPreview] = useState(defaultUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function upload(file: File) {
    const problem = avatarFileError(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(undefined);
    setUploading(true);
    const next = newAvatarPath(userId, file.type, crypto.randomUUID());
    const { error: uploadError } = await createBrowserClient()
      .storage.from("avatars")
      .upload(next, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (uploadError) {
      setError("Upload failed. Try another image.");
      return;
    }
    setPath(next);
    setPreview(URL.createObjectURL(file));
  }

  const message = error ?? serverError;

  return (
    <div className="flex items-center gap-4">
      <input type="hidden" name="avatarPath" value={path ?? ""} />
      <ProfileAvatar name={name} src={preview} />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            id="avatar"
            type="file"
            accept={Object.keys(AVATAR_TYPES).join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-describedby="avatar-hint"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 aria-hidden className="animate-spin" />
            ) : (
              <Upload aria-hidden />
            )}
            {uploading ? "Uploading…" : "Upload photo"}
          </Button>
          {path && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={() => {
                setPath(null);
                setPreview(null);
              }}
            >
              Remove
            </Button>
          )}
        </div>
        <p id="avatar-hint" className="text-xs text-muted-foreground">
          PNG, JPEG, WebP or GIF, up to 2 MB.
        </p>
        <div aria-live="polite">
          <FieldError id="avatar-error" message={message} />
        </div>
      </div>
    </div>
  );
}
