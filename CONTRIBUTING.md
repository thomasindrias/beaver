# Contributing

Thanks for considering a Beaver contribution. Keep changes small, focused, and
easy to review.

## Development Setup

Prerequisites:

- macOS on Apple Silicon for full app/runtime testing.
- Rust stable.
- Node.js and pnpm.
- `uv` for the Python MLX environment.

Install dependencies:

```bash
pnpm install
```

Run the desktop app:

```bash
pnpm tauri dev
```

Run the website:

```bash
pnpm website:dev
```

## Verification

Before opening a pull request, run the checks that match your change:

```bash
pnpm test:run
pnpm website:typecheck
pnpm website:test
pnpm build
pnpm website:build
cd src-tauri && cargo test
cd resources && uv run --no-project --with fastapi --with uvicorn --with pydantic --with tqdm python test_mlx_server.py
```

For release changes, also run:

```bash
pnpm release:mac
```

Unsigned release builds are acceptable for local testing. Signed and notarized
release builds require Apple Developer ID credentials in `.env.release`.

The `Release macOS` GitHub Actions workflow uses these optional secrets for
signed/notarized releases:

- `APPLE_CERTIFICATE_P12_BASE64`
- `APPLE_CERTIFICATE_PASSWORD`
- `KEYCHAIN_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`
- Or App Store Connect API key credentials: `APPLE_API_ISSUER`,
  `APPLE_API_KEY`, `APPLE_API_KEY_P8`

## Pull Requests

- Keep PRs scoped to one behavior or cleanup.
- Add or update tests for behavior changes.
- Avoid committing generated output, local caches, model files, credentials, or
  machine-specific artifacts.
- Explain user-visible changes and privacy/security implications.

## Privacy

Beaver is designed for local inference. Do not add network calls that can send
captures, extracted text, or local history off-device without making the behavior
explicit and user-controlled.

## Python dependencies

`src-tauri/resources/requirements.txt` is the human-edited source;
`requirements.lock` is what ships. After changing requirements, regenerate:

```bash
cd src-tauri/resources
uv pip compile requirements.txt -o requirements.lock --python-version 3.12
```

## Cutting a release

1. Update the version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`,
   and `package.json`; add a `CHANGELOG.md` entry with the date.
2. Merge to `main` with CI green.
3. Run the **Release macOS** workflow with the tag (e.g. `v0.1.0`) — it builds,
   signs, notarizes, and attaches the DMG to a draft release.
4. Edit the draft's notes from the changelog and publish.
