"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

import {
  applyThemePreference,
  readThemePreference,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/components/app/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "system", label: "Sistema", icon: Monitor },
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
];

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) onChange();
  };
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const getServerSnapshot = (): ThemePreference => "system";

/**
 * Segmented control Sistema / Claro / Escuro. Persists in localStorage and respects the
 * system setting by default. `compact` shows icons only (labels stay for screen readers).
 */
export function ThemeToggle({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const pref = useSyncExternalStore(subscribe, readThemePreference, getServerSnapshot);

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className={cn("bg-surface-2 inline-flex items-center gap-1 rounded-full p-1", className)}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = pref === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={compact ? label : undefined}
            title={label}
            onClick={() => applyThemePreference(value)}
            className={cn(
              "press focus-visible:ring-ring inline-flex h-9 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold outline-none focus-visible:ring-2",
              active
                ? "bg-surface text-foreground shadow-card"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon aria-hidden className="size-4" strokeWidth={2} />
            {compact ? null : label}
          </button>
        );
      })}
    </div>
  );
}
