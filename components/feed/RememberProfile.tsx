"use client";

import { useEffect } from "react";

/** Stores the last opened profile id so the "Feed" nav item can link to it. */
export function RememberProfile({ id }: { id: string }) {
  useEffect(() => {
    document.cookie = `aprovo_last_profile=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
  }, [id]);
  return null;
}
