// Use the `image` crate re-exported by `screenshots` (0.24.x) to avoid a
// type-mismatch that arises because our Cargo.toml also depends on `image`
// 0.25.x.  `RgbaImage` returned by the screenshots crate is defined in
// 0.24.x, so we must use the same version's `ImageOutputFormat`.
use screenshots::image::ImageOutputFormat;
use screenshots::Screen;
use std::io::Cursor;

#[derive(Debug, serde::Deserialize)]
pub struct CaptureRegion {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug)]
pub enum CaptureError {
    NoScreenFound,
    CaptureFailed(String),
    EncodeFailed(String),
}

impl std::fmt::Display for CaptureError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NoScreenFound => write!(f, "No screen found at coordinates"),
            Self::CaptureFailed(e) => write!(f, "Capture failed: {e}"),
            Self::EncodeFailed(e) => write!(f, "Encode failed: {e}"),
        }
    }
}

/// Captures a screen region and returns PNG bytes. Image is never written to disk.
///
/// `region.x` and `region.y` are absolute screen coordinates (matching the
/// coordinate space reported by `DisplayInfo`). The function locates the
/// correct screen via `Screen::from_point`, converts to screen-relative
/// coordinates, captures the area, and PNG-encodes the result in memory.
pub fn capture_region(region: &CaptureRegion) -> Result<Vec<u8>, CaptureError> {
    // Locate the screen that contains the top-left corner of the requested
    // region.  `Screen::from_point` accepts absolute coordinates.
    let screen = Screen::from_point(region.x, region.y)
        .map_err(|_| CaptureError::NoScreenFound)?;

    // `capture_area` expects coordinates relative to the screen's own origin.
    let rel_x = region.x - screen.display_info.x;
    let rel_y = region.y - screen.display_info.y;

    let img = screen
        .capture_area(rel_x, rel_y, region.width, region.height)
        .map_err(|e| CaptureError::CaptureFailed(e.to_string()))?;

    let mut buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut buf), ImageOutputFormat::Png)
        .map_err(|e| CaptureError::EncodeFailed(e.to_string()))?;

    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn region_deserializes_from_json() {
        let json = r#"{"x":100,"y":200,"width":300,"height":400}"#;
        let r: CaptureRegion = serde_json::from_str(json).unwrap();
        assert_eq!((r.x, r.y, r.width, r.height), (100, 200, 300, 400));
    }

    #[test]
    fn capture_error_displays_no_screen_message() {
        let e = CaptureError::NoScreenFound;
        assert!(e.to_string().contains("No screen"));
    }

    #[test]
    fn capture_error_displays_failed_message_with_detail() {
        let e = CaptureError::CaptureFailed("timeout".into());
        assert!(e.to_string().contains("timeout"));
    }
}
