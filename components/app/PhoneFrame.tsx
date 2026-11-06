import { cn } from "@/lib/utils";

/** Full width on mobile; constrained to 430px and centered on desktop (feed pages). */
export function PhoneFrame({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full md:max-w-[430px]", className)} {...props} />;
}
