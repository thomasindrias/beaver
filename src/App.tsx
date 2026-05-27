import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CaptureOverlay, type Rect } from "./components/CaptureOverlay";

export default function App() {
  const route = window.location.pathname;

  const handleCapture = useCallback(async (region: Rect) => {
    const win = getCurrentWindow();
    await win.hide(); // Hide overlay before capturing so it doesn't appear in screenshot
    try {
      await invoke("capture_screen_region", { region });
    } finally {
      await win.close();
    }
  }, []);

  const handleCancel = useCallback(async () => {
    await getCurrentWindow().close();
  }, []);

  if (route === "/capture") {
    return <CaptureOverlay onCapture={handleCapture} onCancel={handleCancel} />;
  }

  return null;
}
