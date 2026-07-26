#!/usr/bin/env bats
#
# Tests for install.sh. Sourcing install.sh is safe: its bottom-of-file
# source guard means `main` only runs when the script is executed directly.

setup() {
  source "${BATS_TEST_DIRNAME}/install.sh"
  STUB_BIN="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$STUB_BIN"
  ORIG_PATH="$PATH"
}

# only_stubs strips PATH down to the stub dir; bats runs its own per-test
# cleanup (which shells out to `rm`) in this same process afterwards, so
# PATH has to come back before that.
teardown() {
  PATH="$ORIG_PATH"
}

# Writes an executable stub named $1 into the stub bin dir. Remaining args
# form the stub's body (default: succeed silently).
#
# The shebang must be an absolute interpreter path: only_stubs leaves no
# `bash` on PATH, so a `#!/usr/bin/env bash` stub would die with
# "env: bash: No such file or directory" and every stubbed command would
# return 127 instead of running.
stub() {
  local name="$1"
  shift
  local body="${*:-exit 0}"
  printf '#!/bin/bash\n%s\n' "$body" > "$STUB_BIN/$name"
  chmod +x "$STUB_BIN/$name"
}

# Restricts PATH to the stubs created for this test. Call this LAST, after
# every stub/rm, so setup work still sees the real coreutils. Assertions
# after this point must use bash builtins ($(< file), [[ ]]) rather than
# external commands like cat.
only_stubs() {
  PATH="$STUB_BIN"
}

# Stubs a machine where every prerequisite is satisfied.
all_prereqs_present() {
  stub uname 'echo Darwin'
  stub xcode-select 'echo /Library/Developer/CommandLineTools'
  stub cargo
  stub rustc
  stub node
  stub pnpm
}

@test "is_macos is true when uname reports Darwin" {
  stub uname 'echo Darwin'
  only_stubs
  run is_macos
  [ "$status" -eq 0 ]
}

@test "is_macos is false when uname reports Linux" {
  stub uname 'echo Linux'
  only_stubs
  run is_macos
  [ "$status" -ne 0 ]
}

@test "has_command_line_tools is true when xcode-select resolves a path" {
  stub xcode-select 'echo /Library/Developer/CommandLineTools'
  only_stubs
  run has_command_line_tools
  [ "$status" -eq 0 ]
}

@test "has_command_line_tools is false when xcode-select fails" {
  stub xcode-select 'exit 2'
  only_stubs
  run has_command_line_tools
  [ "$status" -ne 0 ]
}

@test "has_rust is true when cargo and rustc are both present" {
  stub cargo
  stub rustc
  only_stubs
  run has_rust
  [ "$status" -eq 0 ]
}

@test "has_rust is false when cargo is missing" {
  stub rustc
  only_stubs
  run has_rust
  [ "$status" -ne 0 ]
}

@test "has_rust is false when rustc is missing" {
  stub cargo
  only_stubs
  run has_rust
  [ "$status" -ne 0 ]
}

@test "has_node_and_pnpm is true when node and pnpm are both present" {
  stub node
  stub pnpm
  only_stubs
  run has_node_and_pnpm
  [ "$status" -eq 0 ]
}

@test "has_node_and_pnpm is false when node is missing" {
  stub pnpm
  only_stubs
  run has_node_and_pnpm
  [ "$status" -ne 0 ]
}

@test "has_node_and_pnpm is false when pnpm is missing" {
  stub node
  only_stubs
  run has_node_and_pnpm
  [ "$status" -ne 0 ]
}

@test "check_prereqs succeeds when every prerequisite is present" {
  all_prereqs_present
  only_stubs
  run check_prereqs
  [ "$status" -eq 0 ]
}

@test "check_prereqs rejects a non-macOS host before checking anything else" {
  all_prereqs_present
  stub uname 'echo Linux'
  only_stubs
  run check_prereqs
  [ "$status" -ne 0 ]
  [[ "$output" == *"only builds on macOS"* ]]
}

@test "check_prereqs points at xcode-select --install when Command Line Tools are missing" {
  all_prereqs_present
  stub xcode-select 'exit 2'
  only_stubs
  run check_prereqs
  [ "$status" -ne 0 ]
  [[ "$output" == *"xcode-select --install"* ]]
}

@test "check_prereqs points at rustup.rs when Rust is missing" {
  all_prereqs_present
  rm "$STUB_BIN/cargo"
  only_stubs
  run check_prereqs
  [ "$status" -ne 0 ]
  [[ "$output" == *"rustup.rs"* ]]
}

@test "check_prereqs points at nodejs.org and pnpm.io when Node is missing" {
  all_prereqs_present
  rm "$STUB_BIN/node"
  only_stubs
  run check_prereqs
  [ "$status" -ne 0 ]
  [[ "$output" == *"nodejs.org"* ]]
  [[ "$output" == *"pnpm.io"* ]]
}
