import { useCallback, useEffect, useState, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CaptureOverlay, type Rect } from "./components/CaptureOverlay";
import { CaptureHud } from "./components/CaptureHud";
import { hudPosition } from "./lib/hudPosition";
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
  const { saveCapture } = useCaptures({ autoLoad: false });
  const [sel, setSel] = useState<Rect | null>(null);

  const closeWindow = useCallback(() => {
    getCurrentWindow().close().catch(() => {});
  }, []);

  const {
    state,
    errorKind,
    format,
    contentType,
    runCapture,
    reExtract,
    retry,
    engage,
    dismiss,
  } = useBeaver(saveCapture, closeWindow);

  const handleCapture = useCallback(
    (region: Rect) => {
      setSel(region);
      getCurrentWindow().setIgnoreCursorEvents(true).catch(() => {});
      runCapture(region);
    },
    [runCapture]
  );

  // The overlay is click-through while processing (so the screen never feels
  // frozen) and interactive once the HUD has something to offer. Bidirectional
  // because retry re-enters processing from an interactive error state.
  useEffect(() => {
    if (!sel || state === "idle") return;
    getCurrentWindow()
      .setIgnoreCursorEvents(state === "processing")
      .catch(() => {});
  }, [sel, state]);

  const handleCancel = useCallback(async () => {
    await getCurrentWindow().close();
  }, []);

  const openSettings = useCallback(() => {
    invoke("open_screen_recording_settings").catch(() => {});
    dismiss();
  }, [dismiss]);

  const view = selectView(route, getCurrentWindow().label);

  if (view === "capture") {
    if (!sel) {
      return <CaptureOverlay onCapture={handleCapture} onCancel={handleCancel} />;
    }
    return (
      <div
        data-testid="click-away"
        className="fixed inset-0"
        onMouseDown={() => dismiss()}
      >
        <CaptureOverlay frozen={sel} onCapture={() => {}} onCancel={() => {}} />
        <CaptureHud
          state={state}
          errorKind={errorKind}
          contentType={contentType}
          format={format}
          anchor={hudPosition(sel, {
            width: window.innerWidth,
            height: window.innerHeight,
          })}
          onFormatChange={f => reExtract(f)}
          onCustomSubmit={hint => reExtract(format, hint)}
          onRetry={retry}
          onOpenSettings={openSettings}
          onEngage={engage}
          onDismiss={dismiss}
        />
      </div>
    );
  }

  return (
    <Suspense fallback={null}>
      {view === "onboarding" ? <Onboarding /> : <TrayPopover />}
    </Suspense>
  );
}
