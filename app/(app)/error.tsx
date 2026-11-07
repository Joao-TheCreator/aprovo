"use client";

import { ErrorScreen } from "@/components/app/ErrorScreen";

/** Keeps the shell (nav) on screen when a page inside the app fails. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} />;
}
