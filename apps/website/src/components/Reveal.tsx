import type { ReactNode } from "react";
import { useInView } from "../hooks/useInView";

interface RevealProps {
  children: ReactNode;
  /** Stagger index; each step adds ~80ms of transition-delay. */
  index?: number;
  className?: string;
  testId?: string;
}

export function Reveal({ children, index = 0, className, testId }: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      data-testid={testId ?? "reveal"}
      data-visible={inView}
      className={[
        "transition-all duration-700 ease-out",
        inView ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ transitionDelay: `${Math.min(index, 8) * 80}ms` }}
    >
      {children}
    </div>
  );
}
