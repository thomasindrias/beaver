import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toAccelerator } from "../lib/accelerator";
import {
  deleteCloudApiKey,
  getSettings,
  hasCloudApiKey,
  setCloudApiKey,
  updateSettings,
  type Settings,
} from "../lib/api";
import { FORMATS } from "./CaptureHud";
import { Kbd } from "./Kbd";
import { Logo } from "./Logo";

const RETENTION_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Keep forever" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

// Presets only prefill the two fields below; nothing about the choice is
// persisted, which is what keeps "add a provider" a one-line change with no
// backend, no migration, and no new code path. Both fields stay editable, so a
// default that ages is a papercut rather than a break.
const CLOUD_PRESETS: { label: string; base_url: string; model: string }[] = [
  { label: "OpenAI", base_url: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  {
    label: "Anthropic",
    base_url: "https://api.anthropic.com/v1",
    model: "claude-haiku-4-5-20251001",
  },
  {
    label: "Gemini",
    base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.6-flash",
  },
  { label: "Custom", base_url: "", model: "" },
];

export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [recording, setRecording] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  // Local edits to the cloud fields. They are only committed to the backend
  // when the user actually switches the engine on, so a half-typed URL never
  // gets persisted.
  const [draft, setDraft] = useState({ base_url: "", model: "" });

  useEffect(() => {
    getSettings()
      .then(s => {
        setSettings(s);
        setDraft({ base_url: s.cloud_base_url, model: s.cloud_model });
      })
      .catch(console.error);
    hasCloudApiKey().then(setHasKey).catch(console.error);
  }, []);

  // Returns true when the save was accepted. Callers own where a failure is
  // reported, because this panel has two independent error surfaces and an
  // error must appear next to the control that produced it.
  const apply = useCallback(async (next: Settings): Promise<boolean> => {
    try {
      const saved = await updateSettings(next);
      setSettings(saved);
      setShortcutError(null);
      setCloudError(null);
      return true;
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }, []);

  const saveKey = useCallback(async () => {
    if (!keyDraft.trim()) return;
    try {
      await setCloudApiKey(keyDraft);
      setKeyDraft("");
      setHasKey(true);
      setCloudError(null);
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : String(e));
    }
  }, [keyDraft]);

  // `deleteCloudApiKey` also resets a stored cloud engine back to local in the
  // backend, since a cloud engine with no key cannot run. Re-render from its
  // response rather than assuming settings are unchanged, or the picker would
  // keep showing Cloud selected after the key that made it valid is gone.
  const removeKey = useCallback(async () => {
    try {
      const updated = await deleteCloudApiKey();
      setSettings(updated);
      setHasKey(false);
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Commits the draft and the engine flip in one save, so the backend
  // validates the whole configuration together and a rejection leaves the
  // engine untouched. This is also the *only* path that persists draft
  // changes, so it must stay reachable both when switching local -> cloud
  // and when the draft is edited (e.g. a provider preset) while cloud is
  // already active — otherwise a provider switch after cloud is on has no
  // way to reach the backend, leaving a stale base_url paired with whatever
  // key gets saved next.
  const enableCloud = useCallback(async () => {
    if (!settings) return;
    try {
      await apply({
        ...settings,
        engine: "cloud",
        cloud_base_url: draft.base_url,
        cloud_model: draft.model,
      });
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : String(e));
    }
  }, [settings, draft, apply]);

  useEffect(() => {
    if (!recording || !settings) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const accelerator = toAccelerator(e);
      if (!accelerator) return;
      setRecording(false);
      apply({ ...settings, shortcut: accelerator }).catch(e =>
        setShortcutError(e instanceof Error ? e.message : String(e))
      );
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [recording, settings, apply]);

  if (!settings) return null;

  const cloudPanelOpen = cloudOpen || settings.engine === "cloud";

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
              onClick={() =>
                apply({ ...settings, default_format: key }).catch(e =>
                  setShortcutError(e instanceof Error ? e.message : String(e))
                )
              }
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
              onClick={() =>
                apply({ ...settings, history_retention_days: o.value }).catch(e =>
                  setShortcutError(e instanceof Error ? e.message : String(e))
                )
              }
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
            apply({ ...settings, update_check_enabled: !settings.update_check_enabled }).catch(
              e => setShortcutError(e instanceof Error ? e.message : String(e))
            )
          }
        >
          {settings.update_check_enabled ? "Check automatically" : "Off"}
        </Button>
      </Row>

      <Row label="Engine">
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={settings.engine === "local" ? "default" : "outline"}
            aria-pressed={settings.engine === "local"}
            onClick={() => {
              setCloudOpen(false);
              apply({ ...settings, engine: "local" }).catch(e =>
                setShortcutError(e instanceof Error ? e.message : String(e))
              );
            }}
          >
            🔒 Local (on-device)
          </Button>
          <Button
            size="sm"
            variant={settings.engine === "cloud" ? "default" : "outline"}
            aria-pressed={settings.engine === "cloud"}
            onClick={() => setCloudOpen(true)}
          >
            ☁️ Cloud
          </Button>
        </div>
      </Row>

      {cloudPanelOpen && (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <Row label="Provider">
            <div className="flex flex-wrap justify-end gap-1">
              {CLOUD_PRESETS.map(p => (
                <Button
                  key={p.label}
                  size="sm"
                  variant="outline"
                  onClick={() => setDraft({ base_url: p.base_url, model: p.model })}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </Row>

          <Row label="Base URL">
            <input
              aria-label="Base URL"
              value={draft.base_url}
              placeholder="https://api.openai.com/v1"
              onChange={e => setDraft(d => ({ ...d, base_url: e.target.value }))}
              className="w-56 rounded-md border border-border bg-transparent px-2 py-1 text-xs"
            />
          </Row>

          <Row label="Model">
            <input
              aria-label="Model"
              value={draft.model}
              placeholder="gpt-4o-mini"
              onChange={e => setDraft(d => ({ ...d, model: e.target.value }))}
              className="w-56 rounded-md border border-border bg-transparent px-2 py-1 text-xs"
            />
          </Row>

          <Row label="API key">
            <div className="flex items-center gap-1">
              {hasKey && <span className="text-[11px] text-muted-foreground">Key stored</span>}
              <input
                aria-label="API key"
                type="password"
                value={keyDraft}
                placeholder={hasKey ? "Replace stored key" : "sk-..."}
                onChange={e => setKeyDraft(e.target.value)}
                className="w-40 rounded-md border border-border bg-transparent px-2 py-1 text-xs"
              />
              <Button size="sm" variant="outline" onClick={saveKey}>
                Save key
              </Button>
              {hasKey && (
                <Button size="sm" variant="outline" onClick={removeKey}>
                  Remove key
                </Button>
              )}
            </div>
          </Row>

          <Row label="">
            <div className="flex items-center gap-2">
              {(draft.base_url !== settings.cloud_base_url ||
                draft.model !== settings.cloud_model) && (
                <span className="text-[11px] text-muted-foreground">Unsaved changes</span>
              )}
              <Button size="sm" onClick={enableCloud}>
                {settings.engine === "cloud" ? "Save cloud settings" : "Use cloud engine"}
              </Button>
            </div>
          </Row>

          {cloudError && (
            <span className="text-[11px] text-destructive">{cloudError}</span>
          )}
        </div>
      )}
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
