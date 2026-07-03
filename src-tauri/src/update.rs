//! Passive update visibility: compare the running version against the latest
//! GitHub release tag. No downloads, no background timers — callers decide
//! when to check (the popover, at most once per 24h via the cache file).

use std::time::Duration;

pub const RELEASES_API: &str =
    "https://api.github.com/repos/thomasindrias/beaver/releases/latest";
pub const CHECK_INTERVAL_SECS: u64 = 24 * 60 * 60;
pub const ALLOWED_URL_PREFIX: &str = "https://github.com/thomasindrias/beaver";

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct UpdateInfo {
    pub version: String,
    pub url: String,
}

#[derive(serde::Serialize, serde::Deserialize, Default, Clone)]
pub struct CheckCache {
    pub checked_at: u64,
    pub latest_tag: String,
    pub url: String,
}

/// Fold a fetch attempt into the cache that gets written back to disk. A
/// successful fetch replaces the tag/url outright; a failed one (`None`)
/// keeps whatever was previously cached so a single transient network blip
/// doesn't hide an already-known newer version for up to 24h — only
/// `checked_at` advances, which is what keeps the throttle working.
pub fn merge_cache(
    previous: Option<&CheckCache>,
    now: u64,
    fetched: Option<(String, String)>,
) -> CheckCache {
    match fetched {
        Some((latest_tag, url)) => CheckCache { checked_at: now, latest_tag, url },
        None => {
            let (latest_tag, url) = previous
                .map(|c| (c.latest_tag.clone(), c.url.clone()))
                .unwrap_or_default();
            CheckCache { checked_at: now, latest_tag, url }
        }
    }
}

/// Parse "v1.2.3" / "1.2.3" / "1.2" into a comparable triple. Pre-release
/// suffixes ("1.2.3-beta") count as the base version.
pub fn parse_tag(tag: &str) -> Option<(u64, u64, u64)> {
    let t = tag.trim().trim_start_matches('v');
    let mut parts = t.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().ok()?;
    let patch = parts
        .next()
        .unwrap_or("0")
        .split('-')
        .next()?
        .parse()
        .ok()?;
    Some((major, minor, patch))
}

pub fn is_newer(current: &str, latest: &str) -> bool {
    match (parse_tag(current), parse_tag(latest)) {
        (Some(c), Some(l)) => l > c,
        _ => false,
    }
}

pub fn cache_is_fresh(checked_at: u64, now: u64) -> bool {
    now.saturating_sub(checked_at) < CHECK_INTERVAL_SECS
}

/// Only ever open our own GitHub pages from the update pill. The prefix must
/// end at a path boundary so sibling repos (beaver-foo) don't slip through,
/// and a `..` path segment anywhere is rejected outright so the boundary
/// check can't be satisfied and then normalized away to an arbitrary
/// github.com URL (e.g. `.../beaver/../evil`).
pub fn allowed_external_url(url: &str) -> bool {
    if url.split('/').any(|segment| segment == "..") {
        return false;
    }
    match url.strip_prefix(ALLOWED_URL_PREFIX) {
        Some(rest) => rest.is_empty() || rest.starts_with('/'),
        None => false,
    }
}

#[derive(serde::Deserialize)]
struct LatestRelease {
    tag_name: String,
    html_url: String,
}

/// GET the latest release. `None` on any failure — an update check must never
/// surface an error to the user.
pub async fn fetch_latest() -> Option<(String, String)> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .ok()?;
    let resp = client
        .get(RELEASES_API)
        .header("User-Agent", "beaver-update-check")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    let r: LatestRelease = resp.json().await.ok()?;
    Some((r.tag_name, r.html_url))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_v_prefixed_and_bare_tags() {
        assert_eq!(parse_tag("v1.2.3"), Some((1, 2, 3)));
        assert_eq!(parse_tag("0.1.0"), Some((0, 1, 0)));
        assert_eq!(parse_tag("v1.2"), Some((1, 2, 0)));
        assert_eq!(parse_tag("v1.2.3-beta"), Some((1, 2, 3)));
        assert_eq!(parse_tag("not-a-version"), None);
    }

    #[test]
    fn newer_only_when_strictly_greater() {
        assert!(is_newer("0.1.0", "v0.1.1"));
        assert!(is_newer("0.1.0", "v1.0.0"));
        assert!(!is_newer("0.1.0", "v0.1.0"));
        assert!(!is_newer("0.2.0", "v0.1.9"));
        assert!(!is_newer("0.1.0", "garbage"));
    }

    #[test]
    fn empty_latest_tag_is_never_newer() {
        assert!(!is_newer("0.1.0", ""));
    }

    #[test]
    fn cache_freshness_boundary() {
        assert!(cache_is_fresh(1000, 1000 + CHECK_INTERVAL_SECS - 1));
        assert!(!cache_is_fresh(1000, 1000 + CHECK_INTERVAL_SECS));
    }

    #[test]
    fn external_urls_restricted_to_our_repo() {
        assert!(allowed_external_url(
            "https://github.com/thomasindrias/beaver/releases/tag/v0.2.0"
        ));
        assert!(allowed_external_url(ALLOWED_URL_PREFIX));
        assert!(!allowed_external_url("https://github.com/thomasindrias/beaver-evil"));
        assert!(!allowed_external_url("https://evil.example.com/"));
        assert!(!allowed_external_url("file:///etc/passwd"));
    }

    #[test]
    fn rejects_path_traversal_out_of_our_repo() {
        assert!(!allowed_external_url(
            "https://github.com/thomasindrias/beaver/../evil"
        ));
        assert!(allowed_external_url(
            "https://github.com/thomasindrias/beaver/releases/tag/v0.1.0"
        ));
    }

    #[test]
    fn merge_cache_uses_fresh_fetch_when_it_succeeds() {
        let previous = CheckCache {
            checked_at: 1_000,
            latest_tag: "v0.1.0".to_string(),
            url: "https://github.com/thomasindrias/beaver/releases/tag/v0.1.0".to_string(),
        };
        let merged = merge_cache(
            Some(&previous),
            2_000,
            Some((
                "v0.2.0".to_string(),
                "https://github.com/thomasindrias/beaver/releases/tag/v0.2.0".to_string(),
            )),
        );
        assert_eq!(merged.checked_at, 2_000);
        assert_eq!(merged.latest_tag, "v0.2.0");
        assert_eq!(
            merged.url,
            "https://github.com/thomasindrias/beaver/releases/tag/v0.2.0"
        );
    }

    #[test]
    fn merge_cache_keeps_previous_tag_and_url_on_failed_fetch() {
        let previous = CheckCache {
            checked_at: 1_000,
            latest_tag: "v0.2.0".to_string(),
            url: "https://github.com/thomasindrias/beaver/releases/tag/v0.2.0".to_string(),
        };
        // A transient failure must not clobber the last-known newer version —
        // only the throttle timestamp advances.
        let merged = merge_cache(Some(&previous), 2_000, None);
        assert_eq!(merged.checked_at, 2_000);
        assert_eq!(merged.latest_tag, "v0.2.0");
        assert_eq!(
            merged.url,
            "https://github.com/thomasindrias/beaver/releases/tag/v0.2.0"
        );
    }

    #[test]
    fn merge_cache_defaults_to_empty_on_failed_fetch_with_no_prior_cache() {
        let merged = merge_cache(None, 2_000, None);
        assert_eq!(merged.checked_at, 2_000);
        assert_eq!(merged.latest_tag, "");
        assert_eq!(merged.url, "");
    }
}
