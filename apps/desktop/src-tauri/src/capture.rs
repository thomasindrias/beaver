// Use the `image` crate re-exported by `screenshots` (0.24.x) to avoid a
// type-mismatch that arises because our Cargo.toml also depends on `image`
// 0.25.x.  `RgbaImage` returned by the screenshots crate is defined in
// 0.24.x, so we must use the same version's `ImageOutputFormat`.
use screenshots::image::{imageops::FilterType, ImageOutputFormat, RgbaImage};
use screenshots::Screen;
use std::io::Cursor;

/// Cap the long edge of a capture before it goes to the vision model. The model
/// downsamples internally anyway; sending fewer pixels means a smaller PNG, less
/// IPC/JSON, and fewer image tokens — without hurting text legibility.
const MAX_EDGE: u32 = 1568;

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
/// correct screen via `Screen::from_point` and passes the absolute coordinates
/// directly to `capture_area`, which handles the screen-origin offset
/// internally (screenshots 0.8.x+).
pub fn capture_region(region: &CaptureRegion) -> Result<Vec<u8>, CaptureError> {
    // Locate the screen that contains the top-left corner of the requested
    // region.  `Screen::from_point` accepts absolute coordinates.
    let screen = Screen::from_point(region.x, region.y)
        .map_err(|_| CaptureError::NoScreenFound)?;

    // `capture_area` handles the screen-origin offset internally; pass
    // absolute coordinates directly to avoid double-subtraction on
    // non-primary monitors.
    let img = screen
        .capture_area(region.x, region.y, region.width, region.height)
        .map_err(|e| CaptureError::CaptureFailed(e.to_string()))?;

    let img = downscale_to_max_edge(img, MAX_EDGE);

    let mut buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut buf), ImageOutputFormat::Png)
        .map_err(|e| CaptureError::EncodeFailed(e.to_string()))?;

    Ok(buf)
}

/// Scale the image down so its longest edge is at most `max_edge`, preserving
/// aspect ratio. Images already within the limit are returned untouched.
fn downscale_to_max_edge(img: RgbaImage, max_edge: u32) -> RgbaImage {
    let longest = img.width().max(img.height());
    if longest <= max_edge {
        return img;
    }
    let scale = max_edge as f32 / longest as f32;
    let nw = ((img.width() as f32 * scale).round() as u32).max(1);
    let nh = ((img.height() as f32 * scale).round() as u32).max(1);
    screenshots::image::imageops::resize(&img, nw, nh, FilterType::Lanczos3)
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

    #[test]
    fn downscale_leaves_small_images_untouched() {
        let img = RgbaImage::new(800, 600);
        let out = downscale_to_max_edge(img, MAX_EDGE);
        assert_eq!((out.width(), out.height()), (800, 600));
    }

    #[test]
    fn downscale_caps_long_edge_and_keeps_aspect() {
        let img = RgbaImage::new(4000, 2000);
        let out = downscale_to_max_edge(img, 1568);
        assert_eq!(out.width(), 1568);
        assert_eq!(out.height(), 784);
    }
}
