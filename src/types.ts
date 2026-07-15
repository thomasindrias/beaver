export type ContentType = "table" | "code" | "list" | "prose" | "mixed";

export interface Capture {
  id: string;
  created_at: string;
  content: string;
  content_type: ContentType;
  char_count: number;
  app_context: string | null;
}

export type ExtractFormat = "markdown" | "csv" | "json" | "plain";

export type AppState = "idle" | "processing" | "success" | "rerendering" | "error";
