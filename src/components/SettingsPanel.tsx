import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toAccelerator } from "../lib/accelerator";
import { getSettings, updateSettings, type Settings } from "../lib/api";
import { FORMATS } from "./CaptureHud";
import { Kbd } from "./Kbd";
import { Logo } from "./Logo";

const RETENTION_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Keep forever" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [recording, setRecording] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(setSettings).catch(console.error);
  }, []);

  const apply = useCallback(async (next: Settings) => {
    try {
      const saved = await updateSettings(next);
      setSettings(saved);
      setShortcutError(null);
    } catch (e) {
      setShortcutError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (!recording || !settings) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const accelerator = toAccelerator(e);
      if (!accelerator) return;
      setRecording(false);
      apply({ ...settings, shortcut: accelerator });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [recording, settings, apply]);

  if (!settings) return null;

  return (
    <div className="flex h-screen w-full flex-col gap-5 bg-background px-6 py-5 text-foreground">
      <header className="flex items-center gap-2">
        <Logo size={20} />
        <span className="text-[15px] font-semibold tracking-tight">Settings</span>
      </header>

      <Row label="Default format">
        <div className="flex gap-1">
          {FORMATS.map(({ key, label }) => (
            <Button
              key={key}
              size="sm"
              variant={settings.default_format === key ? "default" : "outline"}
              aria-pressed={settings.default_format === key}
              onClick={() => apply({ ...settings, default_format: key })}
            >
              {label}
            </Button>
          ))}
        </div>
      </Row>

      <Row label="Capture shortcut">
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            data-testid="shortcut-field"
            onClick={() => setRecording(true)}
            className="rounded-md border border-border px-2 py-1 text-xs"
          >
            {recording ? "Press new shortcut…" : <Kbd>{settings.shortcut}</Kbd>}
          </button>
          {shortcutError && (
            <span className="text-[11px] text-destructive">{shortcutError}</span>
          )}
        </div>
      </Row>

      <Row label="History">
        <div className="flex gap-1">
          {RETENTION_OPTIONS.map(o => (
            <Button
              key={o.label}
              size="sm"
              variant={settings.history_retention_days === o.value ? "default" : "outline"}
              aria-pressed={settings.history_retention_days === o.value}
              onClick={() => apply({ ...settings, history_retention_days: o.value })}
            >
              {o.label}
            </Button>
          ))}
        </div>
      </Row>

      <Row label="Updates">
        <Button
          size="sm"
          variant={settings.update_check_enabled ? "default" : "outline"}
          aria-pressed={settings.update_check_enabled}
          onClick={() =>
            apply({ ...settings, update_check_enabled: !settings.update_check_enabled })
          }
        >
          {settings.update_check_enabled ? "Check automatically" : "Off"}
        </Button>
      </Row>

      <Row label="Engine">
        <div className="flex gap-1">
          <Button size="sm" variant="default" disabled>
            🔒 Local (on-device)
          </Button>
          <Button size="sm" variant="outline" disabled>
            ☁️ Cloud (coming soon)
          </Button>
        </div>
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
