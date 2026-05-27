import { useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CaptureOverlay, type Rect } from "./components/CaptureOverlay";
import { useOsprey } from "./hooks/useOsprey";
import { useCaptures } from "./hooks/useCaptures";

export default function App() {
  const route = window.location.pathname;
  const { saveCapture } = useCaptures();
  const { runCapture } = useOsprey(saveCapture);

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

  return <div style={{ padding: 16, color: "white", background: "#111" }}>
    History — Task 10
  </div>;
}
