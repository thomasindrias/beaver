pub const EXTRACTION_PROMPT: &str =
    "Extract all data visible in this image. Return as Markdown only. \
     Preserve structure exactly: tables as Markdown tables, lists as Markdown lists, \
     code in fenced code blocks with language hints. \
     Output only the extracted content — no commentary or explanation.";

#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum ExtractFormat {
    Markdown,
    Csv,
    Json,
    Plain,
}

const CSV_PROMPT: &str =
    "Extract the data visible in this image as CSV. \
     Use the first row for column headers. Quote fields that contain commas. \
     If the image has no tabular data, emit a single `text` column with one row per line. \
     Output only the CSV — no commentary, no code fences.";

const JSON_PROMPT: &str =
    "Extract the data visible in this image as JSON. \
     Prefer an array of objects with descriptive keys for tabular data; \
     otherwise mirror the visible structure using objects and arrays. \
     Output only valid JSON — no commentary, no code fences.";

const PLAIN_PROMPT: &str =
    "Extract all text visible in this image as plain text. \
     Preserve reading order and line breaks. No markup, no commentary.";

pub fn prompt_for(format: ExtractFormat, hint: Option<&str>) -> String {
    let base = match format {
        ExtractFormat::Markdown => EXTRACTION_PROMPT,
        ExtractFormat::Csv => CSV_PROMPT,
        ExtractFormat::Json => JSON_PROMPT,
        ExtractFormat::Plain => PLAIN_PROMPT,
    };
    match hint.map(str::trim) {
        Some(h) if !h.is_empty() => format!("{base}\nAdditional instruction from the user: {h}"),
        _ => base.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_for_markdown_without_hint_is_the_default_prompt() {
        assert_eq!(prompt_for(ExtractFormat::Markdown, None), EXTRACTION_PROMPT);
    }

    #[test]
    fn prompt_for_each_format_names_its_output_shape() {
        assert!(prompt_for(ExtractFormat::Csv, None).contains("CSV"));
        assert!(prompt_for(ExtractFormat::Json, None).contains("JSON"));
        assert!(prompt_for(ExtractFormat::Plain, None).contains("plain text"));
    }

    #[test]
    fn prompt_for_appends_a_trimmed_hint() {
        let p = prompt_for(ExtractFormat::Csv, Some("  headers are dates "));
        assert!(p.ends_with("headers are dates"));
        assert!(p.contains("Additional instruction"));
    }

    #[test]
    fn prompt_for_ignores_blank_hints() {
        assert_eq!(
            prompt_for(ExtractFormat::Plain, Some("   ")),
            prompt_for(ExtractFormat::Plain, None)
        );
    }

    #[test]
    fn extract_format_deserializes_from_lowercase_json() {
        let f: ExtractFormat = serde_json::from_str("\"csv\"").unwrap();
        assert_eq!(f, ExtractFormat::Csv);
    }
}
