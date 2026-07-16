import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignLeft,
  ArrowRight,
  Braces,
  Check,
  FileText,
  Loader2,
  Lock,
  RefreshCw,
  Settings,
  Sparkles,
  Table,
  TriangleAlert,
} from "lucide-react";
import type { AppState, ContentType, ExtractFormat } from "../types";
import type { CaptureErrorKind } from "../hooks/useBeaver";

// On-brand loading copy (moved here from the retired CursorToast): a busy
// beaver gnawing your pixels into a tidy dam of data.
export const LOADING_MESSAGES = [
  "Chucking wood…", "Building the dam…", "What the dam…", "Gnawing through…",
  "Hauling logs…", "Packing it tight…", "Damming it up…", "Logging on…",
  "Dam near done…", "Busy as a beaver…", "Felling some trees…",
  "Stacking the sticks…", "Chewing the data…", "Sealing the leaks…",
  "Slapping some tails…", "Working the woodpile…", "Patching the dam…",
  "Whittling it down…", "Mudding the cracks…", "Hold my dam…",
  "Gnaw or never…", "Timber incoming…", "Stockpiling lumber…",
  "Dam, that's a lot…", "Rerouting the river…", "Building back beaver…",
  "Wood you wait a sec…", "Splinter by splinter…", "Chiselling the bark…",
  "Flooding the zone…", "Tail-slapping the bugs…", "Lodging a complaint…",
  "Branching out…", "Knee-deep in twigs…", "Damn fine work…",
  "Eager beaver mode…", "Plugging the gaps…", "Sawing it off…",
  "Gnashing the pixels…", "One more log…",
];
export const MESSAGE_ROTATE_MS = 1200;

// A chip switch fires a model call (seconds, not free), so Tab-lap movement
// only commits after the highlight settles. Clicks and 1–4 commit at once.
export const FORMAT_COMMIT_MS = 400;

export const FORMATS: { key: ExtractFormat; label: string; Icon: typeof Table }[] = [
  { key: "markdown", label: "Markdown", Icon: FileText },
  { key: "csv", label: "Table / CSV", Icon: Table },
  { key: "json", label: "JSON", Icon: Braces },
  { key: "plain", label: "Plain text", Icon: AlignLeft },
];

const TYPE_LABELS: Record<ContentType, string> = {
  table: "table",
  code: "code",
  list: "list",
  prose: "text",
  mixed: "content",
};

interface Props {
  state: AppState;
  errorKind: CaptureErrorKind;
  contentType: ContentType;
  format: ExtractFormat;
  anchor: { x: number; y: number };
  onFormatChange: (f: ExtractFormat) => void;
  onCustomSubmit: (hint: string) => void;
  onRetry: () => void;
  onOpenSettings: () => void;
  onEngage: () => void;
  onDismiss: () => void;
}

export function CaptureHud({
  state,
  errorKind,
  contentType,
  format,
  anchor,
  onFormatChange,
  onCustomSubmit,
  onRetry,
  onOpenSettings,
  onEngage,
  onDismiss,
}: Props) {
  const [revealed, setRevealed] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);
  const [hint, setHint] = useState("");
  const [pending, setPending] = useState<ExtractFormat>(format);
  const [msgIndex, setMsgIndex] = useState(
    () => Math.floor(Math.random() * LOADING_MESSAGES.length)
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const commitRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setPending(format), [format]);

  useEffect(() => {
    if (state === "rerendering") setRevealed(true);
  }, [state]);

  useEffect(() => {
    if (state !== "processing") return;
    const id = setInterval(
      () => setMsgIndex(i => (i + 1) % LOADING_MESSAGES.length),
      MESSAGE_ROTATE_MS
    );
    return () => clearInterval(id);
  }, [state]);

  useEffect(() => {
    if (inputOpen) inputRef.current?.focus();
  }, [inputOpen]);

  // A debounced commit must not outlive the HUD: fire-after-unmount would
  // resurrect a dismissed capture via onFormatChange.
  useEffect(
    () => () => {
      if (commitRef.current) clearTimeout(commitRef.current);
    },
    []
  );

  const reveal = useCallback(() => {
    onEngage();
    setRevealed(true);
  }, [onEngage]);

  const selectFormat = useCallback(
    (key: ExtractFormat, immediate: boolean) => {
      setPending(key);
      if (commitRef.current) clearTimeout(commitRef.current);
      const commit = () => {
        if (key !== format) onFormatChange(key);
      };
      if (immediate) commit();
      else commitRef.current = setTimeout(commit, FORMAT_COMMIT_MS);
    },
    [format, onFormatChange]
  );

  const openInput = useCallback(() => {
    reveal();
    setInputOpen(true);
  }, [reveal]);

  const closeInput = useCallback(() => {
    setInputOpen(false);
    setHint("");
  }, []);

  const submitHint = useCallback(() => {
    const h = hint.trim();
    if (!h) return;
    closeInput();
    onCustomSubmit(h);
  }, [hint, closeInput, onCustomSubmit]);

  useEffect(() => {
    if (state !== "success" && state !== "rerendering" && state !== "error") return;
    const onKey = (e: KeyboardEvent) => {
      if (state === "error") {
        if (e.key === "Enter") {
          (errorKind === "permission" ? onOpenSettings : onRetry)();
        } else if (e.key === "Escape") {
          onDismiss();
        }
        return;
      }
      if (inputOpen) return;
      if (e.key === "Tab") {
        e.preventDefault();
        if (!revealed) {
          reveal();
          return;
        }
        const idx = FORMATS.findIndex(f => f.key === pending);
        if (e.shiftKey) {
          if (idx === 0) openInput();
          else selectFormat(FORMATS[idx - 1].key, false);
        } else {
          if (idx === FORMATS.length - 1) openInput();
          else selectFormat(FORMATS[idx + 1].key, false);
        }
      } else if (e.key === "/") {
        e.preventDefault();
        openInput();
      } else if (e.key >= "1" && e.key <= "4") {
        reveal();
        selectFormat(FORMATS[Number(e.key) - 1].key, true);
      } else if (e.key === "Escape") {
        // Cancel any pending debounced commit so it can't fire after dismissal.
        if (commitRef.current) {
          clearTimeout(commitRef.current);
          commitRef.current = null;
        }
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, errorKind, revealed, inputOpen, pending, reveal, openInput, selectFormat, onDismiss, onOpenSettings, onRetry]);

  if (state === "idle") return null;

  const pill =
    "flex items-center rounded-full border border-white/10 bg-zinc-900/90 shadow-2xl backdrop-blur-md";

  return (
    <div
      data-testid="hud"
      className="fixed z-50"
      style={{ left: anchor.x, top: anchor.y }}
      onMouseDown={e => e.stopPropagation()}
      onMouseEnter={() => {
        if (state === "success" || state === "rerendering") reveal();
      }}
    >
      {state === "processing" && (
        <div className={`${pill} gap-2 px-3 py-2 text-[13px] font-medium text-white`}>
          <Loader2 className="size-4 animate-spin text-primary" />
          <span data-testid="hud-message" className="whitespace-nowrap">
            {LOADING_MESSAGES[msgIndex]}
          </span>
        </div>
      )}

      {state === "error" && (
        <div className={`${pill} gap-2 py-1.5 pl-3 pr-1.5 text-[13px] font-medium text-white`}>
          {errorKind === "permission" ? (
            <Lock className="size-4 text-red-300" />
          ) : (
            <TriangleAlert className="size-4 text-red-300" />
          )}
          <span className="whitespace-nowrap">
            {errorKind === "permission"
              ? "Needs Screen Recording access"
              : "Dam — couldn't read that"}
          </span>
          <button
            aria-label={errorKind === "permission" ? "Open System Settings" : "Retry"}
            onClick={errorKind === "permission" ? onOpenSettings : onRetry}
            className="flex size-6 items-center justify-center rounded-full bg-primary text-zinc-900"
          >
            {errorKind === "permission" ? (
              <Settings className="size-3.5" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </button>
        </div>
      )}

      {(state === "success" || state === "rerendering") && !revealed && (
        <div className={`${pill} gap-2 px-3 py-2 text-[13px] font-medium text-white`}>
          <Check className="size-4 text-primary" strokeWidth={3} />
          <span className="whitespace-nowrap">
            Copied as {TYPE_LABELS[contentType]}
          </span>
        </div>
      )}

      {(state === "success" || state === "rerendering") && revealed && (
        <div className={`${pill} gap-0.5 px-1.5 py-1`}>
          {!inputOpen && (
            <>
              {FORMATS.map(({ key, label, Icon }) => {
                const active = key === pending;
                return (
                  <button
                    key={key}
                    aria-label={label}
                    aria-pressed={active}
                    data-active={active}
                    onClick={() => selectFormat(key, true)}
                    className={`flex h-6 w-7 items-center justify-center rounded-full transition-colors ${
                      active ? "bg-primary text-zinc-900" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {state === "rerendering" && key === format ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Icon className="size-4" />
                    )}
                  </button>
                );
              })}
              <span className="mx-1 h-3.5 w-px bg-white/15" />
            </>
          )}
          {inputOpen && (
            <input
              ref={inputRef}
              aria-label="Formatting hint"
              value={hint}
              placeholder="headers are dates"
              onChange={e => setHint(e.target.value)}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === "Enter") submitHint();
                else if (e.key === "Escape") closeInput();
                else if (e.key === "Tab") {
                  e.preventDefault();
                  closeInput();
                  selectFormat(e.shiftKey ? "plain" : "markdown", false);
                }
              }}
              className="hud-input mx-1 h-6 bg-transparent text-[12.5px] text-zinc-100 outline-none placeholder:text-zinc-500"
            />
          )}
          <button
            aria-label={inputOpen ? "Run" : "Custom hint"}
            onClick={() => {
              if (!inputOpen) openInput();
              else if (hint.trim()) submitHint();
              else closeInput();
            }}
            className={`flex h-6 w-7 items-center justify-center rounded-full transition-colors ${
              inputOpen ? "bg-primary text-zinc-900" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {inputOpen ? <ArrowRight className="size-4" /> : <Sparkles className="size-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
