# Dispatch Bot — WhatsApp + Claude Vision + Google Sheets

## Qué hace
1. Escucha imágenes en el grupo de WhatsApp "Test"
2. Usa Claude Vision para extraer el número de carga de la captura de Newmile
3. Busca al chofer en "Prueba FG" por su número de celular
4. Anota el número de carga en la columna PHOTO libre
5. Responde al chofer con confirmación

---

## Instalación

```bash
npm install
```

---

## Configuración — 3 pasos

### 1. Variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y completa tu API Key de Anthropic (https://console.anthropic.com).
El SPREADSHEET_ID de "Prueba FG" ya está incluido.

---

### 2. Credenciales Google (Service Account)

1. Ve a https://console.cloud.google.com → Crea proyecto "dispatch-bot"
2. Activa la API: Google Sheets API
3. IAM → Cuentas de servicio → Crear → descarga clave JSON
4. Renombra el JSON a `credentials.json` y ponlo en esta carpeta
5. Copia el `client_email` del JSON y comparte el Sheet "Prueba FG" con ese email como Editor

---

### 3. Estructura de la hoja

Cada pestaña debe llamarse `MM.DD` (ej: `04.27`) con estas columnas:

| A       | B           | C       | D    | E   | F      | G     | H  | I  | ...  |
|---------|-------------|---------|------|-----|--------|-------|----|----|------|
| Celular | Driver name | Truck # | RUTA | Qty | STATUS | PHOTO | 1  | 2  | ...  |

El bot detecta automáticamente la pestaña del día actual.

---

## Ejecutar

```bash
npm start
```

Escanea el QR con WhatsApp Business → Dispositivos vinculados.
La sesión queda guardada — solo escaneas una vez.

---

## Flujo de prueba

1. Inicia el bot y escanea QR
2. Desde el número 3002499988 (Adriana) envía captura de Newmile al grupo "Test"
3. El bot extrae el número, lo anota en la hoja y responde confirmando

---

## Solución de problemas

| Problema | Solución |
|---|---|
| QR no aparece | Verifica que Chrome esté instalado |
| Pestaña no encontrada | Crea pestaña del día en formato MM.DD |
| Número no registrado | El celular del chofer debe estar en columna A |
| Error Google Sheets | Verifica acceso del service account al Sheet |
