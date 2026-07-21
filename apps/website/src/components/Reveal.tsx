import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

interface RevealProps {
  children: ReactNode;
  /** Stagger index; each step adds ~80ms of transition-delay. */
  index?: number;
  className?: string;
  testId?: string;
}

export function Reveal({ children, index = 0, className, testId }: RevealProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(prefersReducedMotion);

  useEffect(() => {
    if (prefersReducedMotion || visible) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [prefersReducedMotion, visible]);

  return (
    <div
      ref={ref}
      data-testid={testId ?? "reveal"}
      data-visible={visible}
      className={[
        "transition-all duration-700 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
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
