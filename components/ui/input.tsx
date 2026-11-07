import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-input bg-surface-2/60 text-foreground placeholder:text-muted-foreground hover:border-brand-ink/60 focus-visible:border-brand-ink focus-visible:bg-surface focus-visible:shadow-glow aria-invalid:border-danger-ink aria-invalid:focus-visible:shadow-glow-danger md:text-body h-12 w-full min-w-0 rounded-2xl border-[1.5px] px-4 text-base transition-[border-color,box-shadow,background-color] duration-(--ap-dur-fast) outline-none file:border-0 file:bg-transparent file:font-semibold disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
