import { useState } from "react";
import {
  Table2,
  Code2,
  List,
  AlignLeft,
  Layers,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";
import type { Capture, ContentType } from "../types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TYPE_META: Record<
  ContentType,
  { label: string; Icon: typeof Table2; dot: string; text: string }
> = {
  table: { label: "Table", Icon: Table2, dot: "bg-sky-400", text: "text-sky-300" },
  code: { label: "Code", Icon: Code2, dot: "bg-emerald-400", text: "text-emerald-300" },
  list: { label: "List", Icon: List, dot: "bg-violet-400", text: "text-violet-300" },
  prose: { label: "Text", Icon: AlignLeft, dot: "bg-zinc-400", text: "text-zinc-300" },
  mixed: { label: "Mixed", Icon: Layers, dot: "bg-primary", text: "text-primary" },
};

interface Props { capture: Capture; onCopy: (content: string) => void }

export function CaptureEntry({ capture, onCopy }: Props) {
  const [copied, setCopied] = useState(false);
  const meta = TYPE_META[capture.content_type];
  const preview = capture.content.split("\n").slice(0, 2).join(" ").slice(0, 90);
  const ago = formatAgo(capture.created_at);

  const handleCopy = () => {
    onCopy(capture.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group rounded-xl border border-border bg-card/50 p-2.5 transition-colors hover:border-white/15 hover:bg-card">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${meta.text}`}>
          <meta.Icon className="size-3.5" />
          {meta.label}
        </span>
        {capture.app_context && (
          <span className="truncate text-[11px] text-muted-foreground/70">
            {capture.app_context}
          </span>
        )}
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
          {ago}
        </span>
      </div>

      <p className="mt-1.5 line-clamp-2 font-mono text-[11.5px] leading-snug text-muted-foreground">
        {preview || "—"}
      </p>

      <div className="mt-2 flex items-center gap-1.5">
        <Button
          size="xs"
          variant="secondary"
          onClick={handleCopy}
          className="gap-1"
          aria-label="Copy capture"
        >
          {copied ? (
            <>
              <Check className="size-3 text-primary" /> Copied
            </>
          ) : (
            <>
              <Copy className="size-3" /> Copy
            </>
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="xs" variant="ghost" className="gap-1 text-muted-foreground" />
            }
          >
            Export
            <ChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-36">
            {exportFormats(capture).map((f) => (
              <DropdownMenuItem key={f} onClick={() => exportCapture(capture, f)}>
                {f}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/60">
          {capture.char_count.toLocaleString()} chars
        </span>
      </div>
    </div>
  );
}

function exportFormats(capture: Capture): string[] {
  return [
    "Markdown",
    "Plain text",
    "JSON",
    ...(capture.content_type === "table" ? ["CSV"] : []),
  ];
}

function exportCapture(capture: Capture, format: string) {
  let out = capture.content;

  if (format === "Plain text") {
    out = capture.content
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/`+/g, "")
      .replace(/^\|[-:| ]+\|$/gm, "")
      .replace(/^\|.*\|$/gm, (row) =>
        row.split("|").filter(Boolean).map((c) => c.trim()).join("\t"),
      )
      .replace(/^\s*[-*+]\s+/gm, "")
      .trim();
  } else if (format === "JSON") {
    out = JSON.stringify(
      { type: capture.content_type, captured_at: capture.created_at, content: capture.content },
      null,
      2,
    );
  } else if (format === "CSV" && capture.content_type === "table") {
    const csvCell = (c: string) => `"${c.replace(/"/g, '""')}"`;
    out = capture.content
      .split("\n")
      .filter((l) => l.startsWith("|") && !/^\|[-:| ]+\|$/.test(l))
      .map((l) => l.split("|").filter(Boolean).map((c) => csvCell(c.trim())).join(","))
      .join("\n");
  }

  navigator.clipboard.writeText(out);
}

function formatAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
