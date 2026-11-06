import { cn } from "@/lib/utils";

/** Minimal native range slider styled with the brand accent (no extra packages). */
function Slider({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="range"
      data-slot="slider"
      className={cn(
        "accent-primary focus-visible:ring-ring/50 h-11 w-full cursor-pointer rounded-full outline-none focus-visible:ring-[3px] disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Slider };
