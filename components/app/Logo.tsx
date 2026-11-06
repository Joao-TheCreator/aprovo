import Image from "next/image";

import { cn } from "@/lib/utils";

export function Logo({ className, height = 28 }: { className?: string; height?: number }) {
  return (
    <Image
      src="/brand/aprovo-logo.png"
      alt="APROVO"
      width={Math.round((height * 794) / 346)}
      height={height}
      priority
      className={cn("w-auto", className)}
      style={{ height }}
    />
  );
}
