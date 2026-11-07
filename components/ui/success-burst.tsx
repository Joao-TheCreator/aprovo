import { cn } from "@/lib/utils";

const PARTICLES = 14;
const COLORS = ["#22e688", "#9b3cff", "#6a00ff", "#c78bff", "#7dffb9", "#ffb020"];

/**
 * CSS-only confetti burst (docs/14, "Sucesso"). Render it (e.g. keyed by the decision id)
 * inside a `relative` element when an approval lands; it plays once and stays invisible.
 * Purely decorative: aria-hidden, and reduced motion collapses it to nothing.
 */
export function SuccessBurst({
  className,
  distance = 64,
}: {
  className?: string;
  distance?: number;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 flex items-center justify-center",
        className,
      )}
    >
      {Array.from({ length: PARTICLES }, (_, i) => {
        const angle = (360 / PARTICLES) * i;
        const style = {
          "--ap-burst-angle": `${angle}deg`,
          "--ap-burst-distance": `${distance + (i % 3) * 14}px`,
          backgroundColor: COLORS[i % COLORS.length],
          animationDelay: `${(i % 4) * 18}ms`,
        } as React.CSSProperties;
        return (
          <span
            key={i}
            className={cn(
              "animate-burst absolute size-2 opacity-0 motion-reduce:hidden",
              i % 2 === 0 ? "rounded-full" : "h-3 w-1.5 rounded-sm",
            )}
            style={style}
          />
        );
      })}
    </span>
  );
}
