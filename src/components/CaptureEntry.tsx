import type { Capture, ContentType } from "../types";

const BADGE: Record<ContentType, string> = {
  table: "#3b82f6", code: "#10b981", list: "#8b5cf6",
  prose: "#6b7280", mixed: "#f59e0b",
};

interface Props { capture: Capture; onCopy: (content: string) => void }

export function CaptureEntry({ capture, onCopy }: Props) {
  const preview = capture.content.split("\n").slice(0, 2).join(" ").slice(0, 80);
  const ago = formatAgo(capture.created_at);

  return (
    <div style={{ padding: "10px 12px", borderBottom: "1px solid #1f1f1f", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: BADGE[capture.content_type], color: "#fff" }}>
          {capture.content_type}
        </span>
        {capture.app_context && <span style={{ fontSize: 11, color: "#555" }}>{capture.app_context}</span>}
        <span style={{ fontSize: 11, color: "#444", marginLeft: "auto" }}>{ago}</span>
      </div>

      <p style={{ fontSize: 12, color: "#888", margin: 0, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {preview}
      </p>

      <div style={{ display: "flex", gap: 6 }}>
        <button
          aria-label="Copy"
          onClick={() => onCopy(capture.content)}
          style={{ fontSize: 12, padding: "2px 8px", background: "#2a2a2a", border: "none", borderRadius: 3, color: "#ccc", cursor: "pointer" }}
        >
          Copy
        </button>
        <ExportSelect capture={capture} />
      </div>
    </div>
  );
}

function ExportSelect({ capture }: { capture: Capture }) {
  const formats = ["Markdown", "Plain text", "JSON", ...(capture.content_type === "table" ? ["CSV"] : [])];

  return (
    <select
      defaultValue=""
      onChange={(e) => { exportCapture(capture, e.target.value); e.target.value = ""; }}
      style={{ fontSize: 12, background: "#2a2a2a", border: "none", borderRadius: 3, color: "#ccc", cursor: "pointer" }}
    >
      <option value="" disabled>Export</option>
      {formats.map(f => <option key={f} value={f}>{f}</option>)}
    </select>
  );
}

function exportCapture(capture: Capture, format: string) {
  let out = capture.content;

  if (format === "Plain text") {
    out = capture.content
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/`+/g, "")
      .replace(/^\|.*\|$/gm, row => row.split("|").filter(Boolean).map(c => c.trim()).join("\t"))
      .replace(/^\s*[-*+]\s+/gm, "")
      .trim();
  } else if (format === "JSON") {
    out = JSON.stringify({ type: capture.content_type, captured_at: capture.created_at, content: capture.content }, null, 2);
  } else if (format === "CSV" && capture.content_type === "table") {
    out = capture.content
      .split("\n")
      .filter(l => l.startsWith("|") && !/^\|[-| ]+\|$/.test(l))
      .map(l => l.split("|").filter(Boolean).map(c => c.trim()).join(","))
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
