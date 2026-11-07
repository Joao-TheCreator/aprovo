import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input bg-surface-2/60 text-foreground placeholder:text-muted-foreground hover:border-brand-ink/60 focus-visible:border-brand-ink focus-visible:bg-surface focus-visible:shadow-glow aria-invalid:border-danger-ink md:text-body min-h-28 w-full rounded-2xl border-[1.5px] px-4 py-3 text-base transition-[border-color,box-shadow,background-color] duration-(--ap-dur-fast) outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
