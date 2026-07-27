//! macOS Keychain storage for the BYO-cloud API key. The only module in the
//! codebase that touches Security.framework.
//!
//! The key is deliberately never written to `settings.json`: that file lives
//! in the app-data dir in plaintext and is swept up by Time Machine and any
//! backup tool. It is also never returned to the frontend — `commands.rs`
//! exposes only a boolean "is one stored".

use security_framework::passwords::{
    delete_generic_password, get_generic_password, set_generic_password,
};

const SERVICE: &str = "se.djtl.beaver";
const ACCOUNT: &str = "cloud-api-key";

/// macOS `errSecItemNotFound`. A missing keychain item means "no key
/// configured", which is a normal state rather than a failure, so it maps to
/// `Ok(None)` / `Ok(())` instead of an error.
const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;

fn is_not_found(code: i32) -> bool {
    code == ERR_SEC_ITEM_NOT_FOUND
}

// The `*_for` functions take the service and account explicitly so tests can
// drive a scratch identity, mirroring the pure/impure split settings.rs uses
// for `load_from`/`load`. Error strings never include the key value.

fn set_for(service: &str, account: &str, key: &str) -> Result<(), String> {
    set_generic_password(service, account, key.as_bytes())
        .map_err(|e| format!("failed to store the API key in the keychain: {e}"))
}

fn get_for(service: &str, account: &str) -> Result<Option<String>, String> {
    match get_generic_password(service, account) {
        Ok(bytes) => String::from_utf8(bytes)
            .map(Some)
            .map_err(|_| "the stored API key is not valid UTF-8".to_string()),
        Err(e) if is_not_found(e.code()) => Ok(None),
        Err(e) => Err(format!("failed to read the API key from the keychain: {e}")),
    }
}

fn delete_for(service: &str, account: &str) -> Result<(), String> {
    match delete_generic_password(service, account) {
        Ok(()) => Ok(()),
        Err(e) if is_not_found(e.code()) => Ok(()),
        Err(e) => Err(format!("failed to delete the API key from the keychain: {e}")),
    }
}

pub fn set_api_key(key: &str) -> Result<(), String> {
    set_for(SERVICE, ACCOUNT, key)
}

pub fn api_key() -> Result<Option<String>, String> {
    get_for(SERVICE, ACCOUNT)
}

pub fn delete_api_key() -> Result<(), String> {
    delete_for(SERVICE, ACCOUNT)
}

#[cfg(test)]
mod tests {
    use super::*;

    // A test-only service name so a developer's real Beaver key is never
    // read, overwritten, or deleted by the suite.
    const TEST_SERVICE: &str = "se.djtl.beaver.test";

    #[test]
    fn is_not_found_recognizes_err_sec_item_not_found() {
        assert!(is_not_found(-25300));
    }

    #[test]
    fn is_not_found_rejects_other_codes() {
        assert!(!is_not_found(0));
        assert!(!is_not_found(-25293));
    }

    #[test]
    fn set_then_get_round_trips_the_key() {
        let account = "roundtrip";
        let _ = delete_for(TEST_SERVICE, account);
        set_for(TEST_SERVICE, account, "sk-test-abc123").unwrap();
        assert_eq!(get_for(TEST_SERVICE, account).unwrap(), Some("sk-test-abc123".to_string()));
        delete_for(TEST_SERVICE, account).unwrap();
    }

    #[test]
    fn get_returns_none_when_no_key_is_stored() {
        let account = "absent";
        let _ = delete_for(TEST_SERVICE, account);
        assert_eq!(get_for(TEST_SERVICE, account).unwrap(), None);
    }

    #[test]
    fn delete_is_ok_when_no_key_is_stored() {
        let account = "delete-absent";
        let _ = delete_for(TEST_SERVICE, account);
        assert!(delete_for(TEST_SERVICE, account).is_ok());
    }

    #[test]
    fn set_overwrites_an_existing_key() {
        let account = "overwrite";
        let _ = delete_for(TEST_SERVICE, account);
        set_for(TEST_SERVICE, account, "sk-first").unwrap();
        set_for(TEST_SERVICE, account, "sk-second").unwrap();
        assert_eq!(get_for(TEST_SERVICE, account).unwrap(), Some("sk-second".to_string()));
        delete_for(TEST_SERVICE, account).unwrap();
    }
}
