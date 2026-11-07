import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Wordmark. Two vectors (same 794x346 viewBox): the purple wordmark for light surfaces and
 * `aprovo-logo-dark.svg` (off-white wordmark, same green check) for dark ones; CSS picks one
 * via the `dark:` variant, so it follows the theme without JS.
 */
export function Logo({ className, height = 28 }: { className?: string; height?: number }) {
  const width = Math.round((height * 794) / 346);
  return (
    <>
      <Image
        src="/brand/aprovo-logo.svg"
        alt="APROVO"
        width={width}
        height={height}
        priority
        className={cn("w-auto self-start dark:hidden", className)}
        style={{ height }}
      />
      <Image
        src="/brand/aprovo-logo-dark.svg"
        alt="APROVO"
        width={width}
        height={height}
        priority
        className={cn("hidden w-auto self-start dark:block", className)}
        style={{ height }}
      />
    </>
  );
}
