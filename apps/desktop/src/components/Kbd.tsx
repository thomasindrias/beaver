import { cn } from "@/lib/utils";

export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border bg-secondary px-1.5",
        "font-sans text-[11px] font-medium text-secondary-foreground shadow-sm",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
