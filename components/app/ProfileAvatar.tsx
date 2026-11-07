import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { root: "size-9", text: "text-[0.6875rem]" },
  md: { root: "size-12", text: "text-sm" },
  lg: { root: "size-14", text: "text-base" },
} as const;

/** Two-letter initials from a name, e-mail or @ (fallback "?"). */
export function initialsOf(source?: string | null): string {
  if (!source) return "?";
  const letters = source
    .replace(/^@/, "")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return letters || "?";
}

/**
 * Avatar v2 (docs/14, "Avatar"): optional 2px gradient ring (profiles with pending work, the
 * signed-in user), initials in the display face on `brand-soft` when there is no picture.
 */
export function ProfileAvatar({
  src,
  name,
  initials,
  size = "md",
  ring = false,
  className,
}: {
  src?: string | null;
  /** Used for the initials fallback when `initials` is not given. */
  name?: string | null;
  initials?: string;
  size?: keyof typeof SIZES;
  ring?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full p-[2px]",
        ring ? "bg-gradient-brand shadow-glow" : "bg-outline",
        className,
      )}
    >
      <span className="bg-surface inline-flex rounded-full p-[2px]">
        <Avatar className={SIZES[size].root}>
          {src ? <AvatarImage src={src} alt="" className="object-cover" /> : null}
          <AvatarFallback className={cn("font-display", SIZES[size].text)}>
            {initials ?? initialsOf(name)}
          </AvatarFallback>
        </Avatar>
      </span>
    </span>
  );
}
