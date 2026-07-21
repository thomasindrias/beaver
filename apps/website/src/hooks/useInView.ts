import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/**
 * Latches to true the first time the ref'd element scrolls into view.
 * Starts true immediately (no observer) when motion is reduced, or when
 * IntersectionObserver isn't available.
 */
export function useInView<T extends Element = HTMLDivElement>(threshold = 0.2) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(prefersReducedMotion);

  useEffect(() => {
    if (prefersReducedMotion || inView) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [prefersReducedMotion, inView]);

  return { ref, inView, prefersReducedMotion } as const;
}
