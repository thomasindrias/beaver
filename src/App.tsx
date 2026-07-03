import { useCallback, useState, lazy, Suspense } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CaptureOverlay, type Rect, type Point } from "./components/CaptureOverlay";
import { CursorToast } from "./components/CursorToast";
import { selectView } from "./lib/routing";
import { useBeaver } from "./hooks/useBeaver";
import { useCaptures } from "./hooks/useCaptures";

// The capture overlay opens on a global shortcut and must paint instantly, so
// it stays eager. The popover and onboarding load only in their own windows.
const TrayPopover = lazy(() =>
  import("./components/TrayPopover").then(m => ({ default: m.TrayPopover }))
);
const Onboarding = lazy(() =>
  import("./components/Onboarding").then(m => ({ default: m.Onboarding }))
);

export default function App() {
  const route = window.location.pathname;
  // App never renders the history list itself (TrayPopover does), so it only
  // needs saveCapture — skip the redundant history fetch.
  const { saveCapture } = useCaptures({ autoLoad: false });
  const [origin, setOrigin] = useState<Point | null>(null);

  // Once the result bubble has had its dwell, the overlay window has done its
  // job — close it so the screen is interactive again.
  const closeWindow = useCallback(() => {
    getCurrentWindow().close().catch(() => {});
  }, []);

  const { state, errorKind, runCapture } = useBeaver(saveCapture, closeWindow);

  // Keep the overlay window open to host the toast, but make it click-through
  // so it doesn't swallow clicks across the whole screen while processing —
  // otherwise the fullscreen, always-on-top overlay reads as a frozen screen.
  const handleCapture = useCallback((region: Rect, point: Point) => {
    setOrigin(point);
    getCurrentWindow().setIgnoreCursorEvents(true).catch(() => {});
    runCapture(region);
  }, [runCapture]);

  const handleCancel = useCallback(async () => {
    await getCurrentWindow().close();
  }, []);

  const view = selectView(route, getCurrentWindow().label);

  if (view === "capture") {
    return origin
      ? <CursorToast state={state} errorKind={errorKind} origin={origin} />
      : <CaptureOverlay onCapture={handleCapture} onCancel={handleCancel} />;
  }

  return (
    <Suspense fallback={null}>
      {view === "onboarding" ? <Onboarding /> : <TrayPopover />}
    </Suspense>
  );
}
