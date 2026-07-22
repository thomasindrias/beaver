/**
 * ISO-8601 cutoff timestamp: `days` days before `now` (defaults to the
 * current time). Captures with `created_at` earlier than this get pruned.
 */
export function retentionCutoff(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
