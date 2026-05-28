import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CaptureOverlay, type Rect } from "./components/CaptureOverlay";
import { TrayPopover } from "./components/TrayPopover";
import { Onboarding } from "./components/Onboarding";
import { useOsprey } from "./hooks/useOsprey";
import { useCaptures } from "./hooks/useCaptures";

export default function App() {
  const route = window.location.pathname;
  const [ready, setReady] = useState<boolean | null>(null);
  const { saveCapture } = useCaptures();
  const { runCapture } = useOsprey(saveCapture);

  useEffect(() => {
    invoke<boolean>("is_first_launch").then(first => setReady(!first));
  }, []);

  const handleCapture = useCallback(async (region: Rect) => {
    const win = getCurrentWindow();
    await win.hide();
    await runCapture(region);
    await win.close();
  }, [runCapture]);

  const handleCancel = useCallback(async () => {
    await getCurrentWindow().close();
  }, []);

  if (route === "/capture") {
    return <CaptureOverlay onCapture={handleCapture} onCancel={handleCancel} />;
  }

  if (ready === null) return null;

  if (!ready) {
    return <Onboarding onComplete={() => setReady(true)} />;
  }

  return <TrayPopover />;
}
