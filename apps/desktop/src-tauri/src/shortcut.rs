pub const CAPTURE_SHORTCUT: &str = "CmdOrCtrl+Shift+D";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shortcut_contains_modifier_and_key() {
        assert!(CAPTURE_SHORTCUT.contains("Shift"));
        assert!(CAPTURE_SHORTCUT.contains('D'));
    }
}
