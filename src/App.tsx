import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CaptureOverlay, type Rect } from "./components/CaptureOverlay";
import { useOsprey } from "./hooks/useOsprey";
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
  const [ready, setReady] = useState<boolean | null>(null);
  // App never renders the history list itself (TrayPopover does), so it only
  // needs saveCapture — skip the redundant history fetch.
  const { saveCapture } = useCaptures({ autoLoad: false });
  const { runCapture } = useOsprey(saveCapture);

  useEffect(() => {
    invoke<boolean>("is_first_launch").then(first => setReady(!first));
  }, []);

  const handleCapture = useCallback(async (region: Rect) => {
    const win = getCurrentWindow();
    try {
      await win.hide();
      await runCapture(region);
    } finally {
      await win.close().catch(() => {});
    }
  }, [runCapture]);

  const handleCancel = useCallback(async () => {
    await getCurrentWindow().close();
  }, []);

  if (route === "/capture") {
    return <CaptureOverlay onCapture={handleCapture} onCancel={handleCancel} />;
  }

  if (ready === null) return null;

  return (
    <Suspense fallback={null}>
      {ready ? <TrayPopover /> : <Onboarding onComplete={() => setReady(true)} />}
    </Suspense>
  );
}
