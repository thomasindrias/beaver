import { useCaptures } from "../hooks/useCaptures";
import { HistoryList } from "./HistoryList";

export function TrayPopover() {
  const { captures } = useCaptures();

  return (
    <div style={{ width: 320, background: "#111", color: "#f5f5f5", fontFamily: "system-ui", borderRadius: 8, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #1f1f1f", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: 0.3 }}>Osprey</span>
        <span style={{ fontSize: 11, color: "#444" }}>{captures.length} captures</span>
      </div>
      <HistoryList captures={captures} />
    </div>
  );
}
