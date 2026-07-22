import { useState, useEffect, useCallback } from "react";
import Database from "@tauri-apps/plugin-sql";
import { retentionCutoff } from "../lib/retention";
import type { Capture } from "../types";

interface UseCapturesOptions {
  /** `autoLoad` controls whether history is fetched. The capture overlay only
   * needs to INSERT, so it passes false to skip the SELECT-500 on mount. */
  autoLoad?: boolean;
  /** Prune captures older than this many days before every refresh. `null`
   * (or omitted) keeps everything — no pruning. */
  retentionDays?: number | null;
}

export function useCaptures({ autoLoad = true, retentionDays = null }: UseCapturesOptions = {}) {
  const [captures, setCaptures] = useState<Capture[]>([]);

  const refresh = useCallback(async () => {
    const db = await Database.load("sqlite:beaver.db");
    if (retentionDays != null) {
      await db.execute("DELETE FROM captures WHERE created_at < ?", [retentionCutoff(retentionDays)]);
    }
    const rows = await db.select<Capture[]>(
      "SELECT * FROM captures ORDER BY created_at DESC LIMIT 500"
    );
    setCaptures(rows);
  }, [retentionDays]);

  const saveCapture = useCallback(
    async (capture: Omit<Capture, "id" | "created_at">) => {
      const db = await Database.load("sqlite:beaver.db");
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
      if (autoLoad) await refresh();
    },
    [autoLoad, refresh]
  );

  useEffect(() => {
    if (autoLoad) refresh();
  }, [autoLoad, refresh]);

  return { captures, refresh, saveCapture };
}
