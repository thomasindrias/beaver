//! Screen Recording (TCC) permission checks via CoreGraphics.
//!
//! `CGPreflightScreenCaptureAccess` reads the current grant without prompting;
//! `CGRequestScreenCaptureAccess` shows the system prompt at most once per
//! install — afterwards macOS only listens in System Settings, hence the
//! deep-link. Capture APIs honor a new grant only after the app relaunches.

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

/// Error sentinel returned by capture commands when access is missing.
/// Must match the string the frontend checks for (useBeaver.ts).
pub const PERMISSION_ERROR: &str = "screen-permission-missing";

pub const SETTINGS_URL: &str =
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";

pub fn screen_capture_granted() -> bool {
    #[cfg(target_os = "macos")]
    unsafe {
        CGPreflightScreenCaptureAccess()
    }
    #[cfg(not(target_os = "macos"))]
    true
}

pub fn request_screen_capture() -> bool {
    #[cfg(target_os = "macos")]
    unsafe {
        CGRequestScreenCaptureAccess()
    }
    #[cfg(not(target_os = "macos"))]
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permission_error_is_the_shared_sentinel() {
        assert_eq!(PERMISSION_ERROR, "screen-permission-missing");
    }

    #[test]
    fn settings_url_targets_screen_capture_pane() {
        assert!(SETTINGS_URL.contains("Privacy_ScreenCapture"));
    }
}
