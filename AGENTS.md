# Yangshipin webOS

## Agent skills
- Issue tracker: GitHub Issues. See docs/agents/issue-tracker.md.
- Triage labels: defaults. See docs/agents/triage-labels.md.
- Domain docs: single-context. Read CONTEXT.md and relevant docs/adr/ first.

## Implementation
Use ask-matt and webos-tv-app guidance. Target Chromium 68 and Node 8; do not copy newer-platform examples without adapting. Use TDD for non-trivial logic, and independent code/security review before commits. Never commit credentials, signed stream URLs, device connection details or captured account traffic. Report device evidence separately from desktop tests. Preserve other installed applications and TV/network settings.
