import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("skeleton-shimmer animate-shimmer rounded-2xl", className)}
      {...props}
    />
  );
}

export { Skeleton };
