import { useEffect, useState, useCallback } from "react";

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }

export function normalizeRect(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

interface Props {
  onCapture: (region: Rect, origin: Point) => void;
  onCancel: () => void;
}

export function CaptureOverlay({ onCapture, onCancel }: Props) {
  const [start, setStart] = useState<Point | null>(null);
  const [current, setCurrent] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
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
    setCursor({ x: e.clientX, y: e.clientY });
    if (dragging) setCurrent({ x: e.clientX, y: e.clientY });
  }, [dragging]);

  const onUp = useCallback(() => {
    if (!dragging || !start || !current) return;
    setDragging(false);
    const rect = normalizeRect(start, current);
    if (rect.width > 5 && rect.height > 5) onCapture(rect, current);
    else onCancel();
  }, [dragging, start, current, onCapture, onCancel]);

  const sel = start && current ? normalizeRect(start, current) : null;
  const hasSel = !!sel && sel.width > 1 && sel.height > 1;

  return (
    <div
      className="fixed inset-0 cursor-crosshair select-none overflow-hidden"
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
    >
      {/* Dim layer — hidden once a selection exists (the cutout takes over) */}
      {!hasSel && <div className="absolute inset-0 bg-black/45" />}

      {/* Crosshair guides before the drag starts */}
      {!dragging && cursor && (
        <>
          <div
            className="absolute left-0 right-0 h-px bg-primary/40"
            style={{ top: cursor.y }}
          />
          <div
            className="absolute bottom-0 top-0 w-px bg-primary/40"
            style={{ left: cursor.x }}
          />
        </>
      )}

      {/* Selection rectangle with a punched-out dim around it */}
      {hasSel && sel && (
        <div
          className="absolute rounded-[3px] ring-2 ring-primary"
          style={{
            left: sel.x,
            top: sel.y,
            width: sel.width,
            height: sel.height,
            boxShadow: "0 0 0 100vmax rgba(0,0,0,0.45)",
          }}
        >
          {/* corner ticks */}
          {[
            "left-0 top-0 border-l-2 border-t-2 rounded-tl-[3px]",
            "right-0 top-0 border-r-2 border-t-2 rounded-tr-[3px]",
            "left-0 bottom-0 border-l-2 border-b-2 rounded-bl-[3px]",
            "right-0 bottom-0 border-r-2 border-b-2 rounded-br-[3px]",
          ].map((c) => (
            <span key={c} className={`absolute size-3 border-primary ${c}`} />
          ))}

          {/* dimensions readout */}
          <div
            className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/80 px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-primary shadow-lg backdrop-blur"
            style={{ top: sel.height > 38 ? 6 : sel.height + 8 }}
          >
            {Math.round(sel.width)} × {Math.round(sel.height)}
          </div>
        </div>
      )}

      {/* Hint pill */}
      {!hasSel && (
        <div className="pointer-events-none absolute left-1/2 top-7 -translate-x-1/2">
          <div className="animate-rise flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-3.5 py-1.5 text-[13px] text-white/90 shadow-xl backdrop-blur-md">
            <span className="size-1.5 animate-beaver-pulse rounded-full bg-primary" />
            Drag to capture the data
            <span className="text-white/40">·</span>
            <span className="text-white/55">Esc to cancel</span>
          </div>
        </div>
      )}
    </div>
  );
}
