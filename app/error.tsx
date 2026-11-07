"use client";

import { ErrorScreen } from "@/components/app/ErrorScreen";

export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} fullScreen />;
}
