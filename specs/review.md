# Spec Review

## Spec: WhatsApp Bot con Baileys para registro de cargas Newmile
## Reviewed: 2026-08-14

## Acceptance criteria

| ID    | Status        | Evidence |
|-------|--------------|----------|
| AC-01 | PASS         | `useMultiFileAuthState('./auth_wa')` (bot-wa.js:232); `printQRInTerminal: true` (bot-wa.js:237) |
| AC-02 | PASS         | `if (TARGET_GROUP_IDS.length && !TARGET_GROUP_IDS.includes(remoteJid)) { continue; }` (bot-wa.js:276) — unrecognized groups are skipped silently (internal log only, no reply) |
| AC-03 | PASS         | `procesarFoto` downloads image via `downloadMediaMessage` → base64 → `extraerDatosImagen` → `leerFilasHoy` → `encontrarChoferPorNombre` → `anotarEnSheet` (bot-wa.js:105–167) |
| AC-04 | PASS         | `await sendWAMessage(groupId, \`Listo ${driverName}. Carga ${resultado.numero} registrada.\`)` (bot-wa.js:160) |
| AC-05 | PASS         | `await sendWAMessage(groupId, \`Carga ${resultado.numero} ya fue registrada. Envía la captura correcta.\`)` (bot-wa.js:157) |
| AC-06 | PASS         | `procesarRegistro` writes `senderPhone` to `Choferes!E${rowIndex}` (bot-wa.js:201–206); updates `WA_MAP` in-memory (bot-wa.js:207); subsequent photos are recognized via that map |
| AC-07 | PASS         | `if (resultado.tipo === 'IGNORAR') { return; }` (bot-wa.js:116–119) — no reply, no sheet write |
| AC-08 | PASS         | `if (!nombrePrincipal) { sendWAMessage(groupId, 'Para registrarte...'); notificarOwner(...); return; }` (bot-wa.js:133–138) |
| AC-09 | PASS         | `shared.js` exports: `getGoogleSheets`, `leerFilasHoy`, `anotarEnSheet`, `encontrarChoferPorNombre` (renamed from `encontrarChofer` in spec — acceptable), `colIdxToLetra`, `writeLog`. All imported in `bot-wa.js:8–19`. No helpers are duplicated. |
| AC-10 | PASS         | `fly-wa.toml` line 6: `app = "dispatch-bot-wa"` (different name); lines 17–19: `[[mounts]] source = "wa_auth" destination = "/app/auth_wa"` |
| AC-11 | PASS         | `cron.schedule('0 22 * * *', ..., { timezone: 'America/Bogota' })` (bot-wa.js:94–101); calls `copiarProgramacionManana(SPREADSHEET_ID, notificarOwner)`; owner notified via `sock.sendMessage` through `notificarOwner` |
| AC-12 | PASS         | `bot.js` contains the original unmodified Telegram implementation; no Baileys references; git diff confirms no changes |

## Validation results
- npm test: SKIPPED — no `test` script defined in package.json
- npm run lint: SKIPPED — no `lint` script defined in package.json
- npm run build: SKIPPED — no `build` script defined in package.json
- `node --check bot-wa.js`: exit 0 (no syntax errors)
- `node --check shared.js`: exit 0 (no syntax errors)

## Additional findings

### Bugs
- None found

### Missing requirements
- `bot-wa.js` does not import `colIdxToLetra` directly. The spec's AC-09 lists it as one of the helpers `bot-wa.js` should import. In practice the function is used internally by `anotarEnSheet` (which IS imported), so no code is duplicated and the intent of the criterion is satisfied. Minor specification/naming gap only.

### Security issues
- None found. `fly-wa.toml` contains no `TELEGRAM_BOT_TOKEN`. Sensitive env vars (`SPREADSHEET_ID`, `GOOGLE_CREDENTIALS_JSON`, `ANTHROPIC_API_KEY`, `WA_GROUP_IDS`, `OWNER_WA_NUMBER`) are loaded from environment, not hardcoded. The `SHEET_ID_2026` constant remains hardcoded in `shared.js` matching the pattern in `bot.js`.

### Unhandled edge cases
- Images sent as WhatsApp documents (forwarded as files, `documentMessage` type) are not processed — only `imageMessage` is handled. This is not in the spec's edge case table but could occur in practice. Low risk.
- Between socket close and reconnect, cron-triggered owner notifications fail gracefully with a logged error (no crash); acceptable per the reconnect spec.

### Convention violations
- `encontrarChofer` (spec AC-09 name) was renamed to `encontrarChoferPorNombre` in the implementation. This is a valid clarification since the WA version takes a name argument rather than a userId, distinguishing it from `bot.js`'s `encontrarChofer(driverRows, telegramUserId)`. No impact on behaviour.
- Reconnect via `setTimeout(iniciarBot, 3000)` creates a new socket without calling `.ev.removeAllListeners()` on the previous socket. Old sockets are closed so events won't fire, but dangling closures remain until GC. Negligible for this workload.

## Required fixes
(Not applicable — verdict is PASS)

## Verdict

SPEC REVIEW: PASS
