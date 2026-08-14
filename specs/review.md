# Spec Review

## Spec: WhatsApp Bot con Baileys para registro de cargas Newmile
## Reviewed: 2026-08-14

## Acceptance criteria

| ID    | Status | Evidence |
|-------|--------|----------|
| AC-01 | FAIL   | `bot-wa.js` does not exist; no Baileys connection code present |
| AC-02 | FAIL   | `bot-wa.js` does not exist; no group-filter logic present |
| AC-03 | FAIL   | `bot-wa.js` does not exist; no image download or Claude Vision call present |
| AC-04 | FAIL   | `bot-wa.js` does not exist; no reply logic present |
| AC-05 | FAIL   | `bot-wa.js` does not exist; no duplicate-load detection present |
| AC-06 | FAIL   | `bot-wa.js` does not exist; no "registrar" command handler present |
| AC-07 | FAIL   | `bot-wa.js` does not exist; no IGNORAR handling present |
| AC-08 | FAIL   | `bot-wa.js` does not exist; no unregistered-driver flow present |
| AC-09 | FAIL   | `shared.js` does not exist; helpers are not extracted or exported |
| AC-10 | FAIL   | `fly-wa.toml` does not exist |
| AC-11 | FAIL   | `bot-wa.js` does not exist; no cron present |
| AC-12 | NOT VERIFIED | `bot.js` is not present in the repository clone on this machine (lives on the developer's local Windows path). It cannot be inspected to confirm it was left unmodified. |

## Validation results
- npm test: SKIPPED — no `package.json` present in the repository
- npm run lint: SKIPPED — no `package.json` present in the repository
- npm run build: SKIPPED — no `package.json` present in the repository

## Additional findings

### Bugs
- None found (no code to review)

### Missing requirements
- All four files listed under "Files to modify" are absent from the repository:
  - `clientes/TREC/dispatch-bot/bot-wa.js` — not created
  - `clientes/TREC/dispatch-bot/shared.js` — not created
  - `clientes/TREC/dispatch-bot/fly-wa.toml` — not created
  - `clientes/TREC/dispatch-bot/package.json` — not modified (file does not exist in this repo clone)
- The `clientes/TREC/dispatch-bot/` directory does not exist in the repository on this machine. The dispatch-bot source code (including `bot.js`) appears to reside only on the developer's local Windows filesystem at the path documented in CLAUDE.md, and has not been pushed to the remote or is otherwise absent from this environment.

### Security issues
- None found (no code to review)

### Unhandled edge cases
- None verifiable (no code to review)

### Convention violations
- None found (no code to review)

## Required fixes

1. Create `clientes/TREC/dispatch-bot/shared.js` extracting the six helpers from `bot.js` and exporting them via `module.exports` (satisfies AC-09).
2. Create `clientes/TREC/dispatch-bot/bot-wa.js` implementing the full Baileys bot as described in the spec implementation plan (satisfies AC-01 through AC-08, AC-11).
3. Modify `clientes/TREC/dispatch-bot/package.json` to add `@whiskeysockets/baileys: ^6.7.0` and `qrcode-terminal: ^0.12.0` under `dependencies`.
4. Create `clientes/TREC/dispatch-bot/fly-wa.toml` defining a separate Fly.io app with a volume mount for `auth_wa/` (satisfies AC-10).
5. Confirm `bot.js` is unmodified and commit or push the dispatch-bot directory so it is accessible in the review environment (required to verify AC-12).

## Verdict

SPEC REVIEW: FAIL
