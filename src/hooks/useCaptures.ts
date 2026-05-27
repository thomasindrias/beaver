import { useState, useEffect, useCallback } from "react";
import Database from "@tauri-apps/plugin-sql";
import type { Capture } from "../types";

export function useCaptures() {
  const [captures, setCaptures] = useState<Capture[]>([]);

  const refresh = useCallback(async () => {
    const db = await Database.load("sqlite:osprey.db");
    const rows = await db.select<Capture[]>(
      "SELECT * FROM captures ORDER BY created_at DESC LIMIT 500"
    );
    setCaptures(rows);
  }, []);

  const saveCapture = useCallback(
    async (capture: Omit<Capture, "id" | "created_at">) => {
      const db = await Database.load("sqlite:osprey.db");
      await db.execute(
        `INSERT INTO captures (id, created_at, content, content_type, char_count, app_context)
         VALUES (?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          capture.content,
          capture.content_type,
          capture.char_count,
          capture.app_context ?? null,
        ]
      );
      await refresh();
    },
    [refresh]
  );

  useEffect(() => { refresh(); }, [refresh]);

  return { captures, refresh, saveCapture };
}
