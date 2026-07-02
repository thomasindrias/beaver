# Security Policy

## Supported Versions

Security fixes target the current `main` branch until Beaver has versioned
stable releases.

## Reporting a Vulnerability

Please do not report suspected vulnerabilities in public issues. Use GitHub
private vulnerability reporting for this repository when available. If private
reporting is unavailable, open a public issue that asks for a private security
contact without including exploit details.

Helpful reports include:

- Affected commit or release.
- macOS version and hardware architecture.
- Reproduction steps.
- Impact and any known mitigations.

## Security Model

Beaver captures user-selected screen regions, stores capture history locally in
SQLite, and runs vision inference through a localhost-only MLX server. The first
setup downloads the model and Python dependencies; captures should not leave the
machine during normal use.

The macOS build uses hardened-runtime entitlements needed for screen capture and
the bundled Python/MLX runtime. Keep entitlement changes narrow and document the
reason for any new permission.
