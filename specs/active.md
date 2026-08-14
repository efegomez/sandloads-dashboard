# Spec: WhatsApp Bot con Baileys para registro de cargas Newmile

## Request
Crear bot-wa.js con Baileys para el grupo de WhatsApp que:
- Escuche fotos en un grupo de WA específico
- Extraiga el número de carga de screenshots Newmile usando Claude Vision
- Registre la carga en Google Sheets (hoja TEST)
- Responda en el grupo confirmando el registro o indicando duplicado
- Permita registro de choferes por número de teléfono WA
- Reemplaza al bot de Telegram — todo el flujo opera por WA
- Incluye el cron nocturno (10 PM Bogotá) de copia de programación
- Notificaciones al owner (dispatcher) vía mensaje WA directo

## Context

### Arquitectura actual (bot.js — Telegram)
El dispatch-bot de Telegram (`bot.js`) implementa el flujo completo:
- **Autenticación Google**: via `GOOGLE_CREDENTIALS_JSON` (env) o `credentials.json` (archivo)
- **Sheet TEST**: `SPREADSHEET_ID` (env var) — hoja de destino
- **Sheet 2026**: `SHEET_ID_2026` (hardcoded) — fuente de programación
- **Columnas del tab diario**: `COL_DRIVER=2`, `COL_TRUCK=3`, `COL_RUTA=4`, `COL_PHOTO_FIRST=8`
- **Claude Vision**: modelo `claude-haiku-4-5-20251001`, responde `NEWMILE|1234567` o `IGNORAR`
- **Helpers reutilizables**: `getGoogleSheets()`, `leerFilasHoy()`, `anotarEnSheet()`, `encontrarChofer()`, `colIdxToLetra()`
- **Directorio de choferes**: hoja `Choferes!A2:D100` — columnas: nombre, ?, principal, telegramId
- **Identificación de chofer**: `TELEGRAM_MAP[telegramUserId] → nombrePrincipal`
- **Logging**: `writeLog()` a archivos diarios en `logs/`
- **Cron 10 PM**: copia programación de 2026 → TEST — debe incluirse en bot-wa.js

### Cambio clave para WA
En Telegram el ID del remitente es `ctx.from.id`. En Baileys es el número de teléfono extraído del JID del remitente en grupo: `msg.key.participant` → `573001234567@s.whatsapp.net` → número `573001234567`.

El mapeo de choferes necesita una **columna nueva "WA"** en la hoja `Choferes` (columna E, índice 4) para guardar el número WA. El `WA_MAP` funciona igual que `TELEGRAM_MAP` pero con número telefónico como clave.

### Supuestos
- La hoja `Choferes` tiene espacio para columna E (WA Phone) — no hay datos ahí actualmente
- `OWNER_WA_NUMBER` se define en `.env` como número WA del dispatcher para notificaciones
- El número WA del bot (dedicado al bot) ya está activo con WhatsApp instalado
- El grupo de WA se identifica por `WA_GROUP_IDS` (env var, JID completo: `120363XXXXXXXX@g.us`)

## Files to modify

- `bot-wa.js` (nuevo) — bot WhatsApp completo con Baileys
- `package.json` (modificar) — agregar `@whiskeysockets/baileys` y `qrcode-terminal`
- `fly-wa.toml` (nuevo) — configuración Fly.io para app separada del bot WA
- `shared.js` (nuevo) — helpers extraídos de bot.js para reutilizar sin duplicar: `getGoogleSheets`, `leerFilasHoy`, `anotarEnSheet`, `encontrarChofer`, `colIdxToLetra`, `writeLog`

## Implementation plan

1. **Crear `shared.js`**: extraer de `bot.js` los helpers puros (sin dependencias de Telegram ni Baileys): `getGoogleSheets`, `leerFilasHoy`, `anotarEnSheet`, `encontrarChofer`, `colIdxToLetra`, `writeLog`. Exportarlos con `module.exports`.

2. **Actualizar `package.json`**: agregar en `dependencies`:
   - `@whiskeysockets/baileys`: `^6.7.0`
   - `qrcode-terminal`: `^0.12.0`

3. **Crear `bot-wa.js`**:
   a. Importar Baileys (`makeWASocket`, `useMultiFileAuthState`, `downloadMediaMessage`, `DisconnectReason`)
   b. Importar helpers de `shared.js`
   c. Leer env vars: `WA_GROUP_IDS`, `OWNER_WA_NUMBER`, `SPREADSHEET_ID`, `ANTHROPIC_API_KEY`, `GOOGLE_CREDENTIALS_JSON`
   d. Definir `WA_MAP` (phone → nombrePrincipal) y `NAME_TO_PHONE` — cargar desde hoja `Choferes!A2:E100` (columna E = WA)
   e. `cargarDirectorioWA()` — igual que `cargarDirectorio()` pero leyendo columna E
   f. Función `iniciarBot()`:
      - `useMultiFileAuthState('./auth_wa')` para persistir sesión
      - `makeWASocket({ auth: state, printQRInTerminal: true })`
      - Handler `connection.update`: mostrar QR, manejar reconexión en `DisconnectReason.loggedOut`
      - Handler `creds.update`: guardar credenciales
      - Handler `messages.upsert`: procesar mensajes entrantes
   g. En handler `messages.upsert`:
      - Ignorar si `msg.key.fromMe`
      - Ignorar si `msg.key.remoteJid` no está en `WA_GROUP_IDS`
      - Extraer `senderPhone` de `msg.key.participant`
      - Detectar tipo de mensaje: `imageMessage` → flujo de foto; texto con "registrar" → flujo de registro
   h. **Flujo foto**: `downloadMediaMessage` → buffer a base64 → `extraerDatosImagen` → si NEWMILE → `leerFilasHoy` → `encontrarChofer` → `anotarEnSheet` → reply en grupo
   i. **Flujo registro**: extraer nombre del texto → buscar en hoja `Choferes` → guardar número en columna E → actualizar `WA_MAP` → reply confirmación
   j. Reconexión automática con backoff en caso de desconexión no intencional

4. **Agregar cron nocturno en `bot-wa.js`**: misma lógica de `copiarProgramacionManana()` de `bot.js`, pero las notificaciones al owner van vía `sock.sendMessage(OWNER_WA_NUMBER, { text: ... })` en lugar de `bot.telegram.sendMessage`. Cron schedule: `0 22 * * *` timezone `America/Bogota`.

5. **Crear `fly-wa.toml`**: app separada (ej. `dispatch-bot-wa`), sin `TELEGRAM_BOT_TOKEN`, con `WA_GROUP_IDS` y `OWNER_WA_NUMBER`, volumen para `auth_wa/`

6. **NO modificar `bot.js`** — queda como referencia histórica, no se ejecuta

## Edge cases

| Caso | Manejo |
|---|---|
| Chofer no registrado envía foto | Reply en grupo: "Para registrarte escribe: registrar TuNombreExacto". Notificar a owner con número WA |
| Imagen no es Newmile | `tipo === 'IGNORAR'` → no responder, no escribir |
| Carga duplicada | Reply: "Carga [número] ya fue registrada. Envía la captura correcta." |
| Tab del día no existe en sheet | Reply error al grupo + notificar a owner |
| Sesión WA expirada (loggedOut) | No reconectar automáticamente — loguear y detener proceso (Fly.io reinicia) |
| Desconexión temporal (no loggedOut) | Reconectar automáticamente con delay de 3s |
| Mensaje propio del bot | `msg.key.fromMe === true` → ignorar |
| Mensaje de chat individual (no grupo) | `remoteJid` no termina en `@g.us` → ignorar |
| Nombre en "registrar" no existe en Choferes | Reply: "No encontré [nombre]. Verifica tu nombre exacto." |
| Registro duplicado (mismo número ya registrado) | Sobrescribir con el nuevo número + confirmar |
| `WA_GROUP_IDS` vacío | Loguear advertencia al arrancar; procesar todos los grupos (modo debug) |
| Múltiples imágenes en un mensaje | Baileys envía cada imagen como mensaje separado — se procesan individualmente |

## Acceptance criteria

- [ ] AC-01: Bot conecta a WA mostrando QR en terminal en primera ejecución; sesión persiste en `auth_wa/` y no pide QR en reinicios posteriores
- [ ] AC-02: Mensajes de grupos no listados en `WA_GROUP_IDS` son ignorados silenciosamente
- [ ] AC-03: Foto de pantalla Newmile enviada por chofer registrado → número extraído por Claude Vision → escrito en columna correcta de la hoja TEST
- [ ] AC-04: Bot responde en el grupo: `"Listo [Nombre]. Carga [número] registrada."` tras registro exitoso
- [ ] AC-05: Carga ya existente en la fila del chofer → bot responde en el grupo: `"Carga [número] ya fue registrada."`
- [ ] AC-06: Chofer envía `"registrar Juan Perez"` en el grupo → número WA guardado en columna E de hoja Choferes → fotos subsiguientes del mismo número se reconocen
- [ ] AC-07: Imagen que no es Newmile (ticket papel, etc.) → sin reply, sin escritura en sheet
- [ ] AC-08: Chofer no registrado envía foto → bot responde pidiéndole registrarse; owner recibe notificación con el número WA
- [ ] AC-09: `shared.js` exporta los helpers (`getGoogleSheets`, `leerFilasHoy`, `anotarEnSheet`, `encontrarChofer`, `colIdxToLetra`, `writeLog`); `bot-wa.js` los importa en lugar de duplicar código
- [ ] AC-10: `fly-wa.toml` define una app separada con nombre distinto; incluye mount de volumen para `auth_wa/`
- [ ] AC-11: Cron `0 22 * * *` (Bogotá) en `bot-wa.js` copia la programación del día siguiente de Sandloads 2026 → TEST y notifica al owner vía mensaje WA
- [ ] AC-12: `bot.js` (Telegram) no es modificado

## Out of scope

- Manejo de mensajes de audio en WA (feature separado)
- Shorthand de 4 dígitos → 7 dígitos (feature separado, definido en conversación)
- Deploy efectivo a Fly.io (se hace manualmente tras validar)
- Tests automatizados
