import { useEffect, useState, useCallback } from "react";

interface Point { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }

function normalizeRect(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

interface Props {
  onCapture: (region: Rect) => void;
  onCancel: () => void;
}

export function CaptureOverlay({ onCapture, onCancel }: Props) {
  const [start, setStart] = useState<Point | null>(null);
  const [current, setCurrent] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const onDown = useCallback((e: React.MouseEvent) => {
    setDragging(true);
    setStart({ x: e.clientX, y: e.clientY });
    setCurrent({ x: e.clientX, y: e.clientY });
  }, []);

  const onMove = useCallback((e: React.MouseEvent) => {
    if (dragging) setCurrent({ x: e.clientX, y: e.clientY });
  }, [dragging]);

  const onUp = useCallback(() => {
    if (!dragging || !start || !current) return;
    setDragging(false);
    const rect = normalizeRect(start, current);
    if (rect.width > 5 && rect.height > 5) onCapture(rect);
    else onCancel();
  }, [dragging, start, current, onCapture, onCancel]);

  const sel = start && current ? normalizeRect(start, current) : null;

  return (
    <div
      style={{ position: "fixed", inset: 0, cursor: "crosshair", userSelect: "none" }}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)" }} />
      {sel && sel.width > 0 && (
        <div style={{
          position: "absolute",
          left: sel.x, top: sel.y,
          width: sel.width, height: sel.height,
          border: "2px solid #f59e0b",
          background: "rgba(245,158,11,0.08)",
          boxSizing: "border-box",
          pointerEvents: "none",
        }} />
      )}
    </div>
  );
}
