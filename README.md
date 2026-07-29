# LexControl — Gestor de Causas

App de escritorio-web para litigación: expedientes, plazos judiciales chilenos,
matriz probatoria y puente al disco duro forense del estudio.

Son dos piezas que corren juntas:

| Pieza | Qué hace |
|---|---|
| **Frontend React + Vite** | La interfaz (`src/`). Puerto 5173 en desarrollo. |
| **Servidor forense Python** | `servidor_local_lexcontrol.py`. Puerto 8888. Abre archivos en el escritorio Linux vía `xdg-open`, escanea carpetas, parsea PDFs, importa el Excel del PJUD, consulta Gemini y **sirve los catálogos de datos**. |

Sin el servidor Python levantado, la app carga pero muestra un aviso rojo y queda
sin datos: los catálogos ya no viajan dentro del bundle.

## Puesta en marcha

```bash
# 1. Credenciales (una sola vez)
cp .env.example .env                       # y pon tu GEMINI_API_KEY
cp .pjud_config.example.json .pjud_config.json
chmod 600 .env .pjud_config.json           # y pon tu RUT y clave del PJUD

# 2. Dependencias
npm install

# 3. Levantar las dos piezas, en terminales separadas
python3 servidor_local_lexcontrol.py
npm run dev
```

Si el 8888 está ocupado: `LEXCONTROL_PORT=8899 python3 servidor_local_lexcontrol.py`,
y apunta el frontend con `VITE_LEXCONTROL_API=http://localhost:8899` en un `.env.local`.

## Los catálogos de datos

Los dos catálogos pesados viven en `data/` como JSON y los sirve el servidor Python
en `/data/<nombre>`, comprimidos con gzip y con `ETag` para revalidación.

| Catálogo | Contenido | Se regenera con |
|---|---|---|
| `data/realDiskData.json` | 293 mandantes y 17.742 archivos indexados del disco `/media/jaime/.../Casos2023` | `python3 generar_db_disco_real.py` (necesita el disco montado) |
| `data/pjudCausesData.json` | 1.557 causas del Excel oficial del PJUD, cruzadas contra las carpetas del disco | `python3 importar_excel_pjud.py` |

Antes esto eran dos archivos `.js` de ~137.000 líneas en total que se compilaban
dentro del bundle, dejándolo en 5,8 MB. Ahora el bundle pesa 506 kB.

Todo acceso a los catálogos desde Python pasa por `catalogos.py`; el frontend los
carga con *top-level await* en `src/realDiskData.js` y `src/pjudCausesData.js`, de
modo que los componentes siguen importando constantes sincrónicas.

## Seguridad

- `.env`, `.pjud_config.json` y `pjud_cookies.json` están en `.gitignore` y **nunca**
  deben versionarse. Los `.example` son las plantillas.
- El servidor escucha solo en `localhost` y ejecuta `xdg-open` sobre rutas que recibe
  por HTTP: no lo expongas a la red.
- `data/*.json` contiene nombres de mandantes y rutas de sus expedientes. Si algún
  día agregas un remoto a este repo, sácalos del control de versiones primero.

## Comandos

```bash
npm run dev       # desarrollo con HMR
npm run build     # build de producción a dist/
npm run preview   # sirve el build
npm run lint      # oxlint
```
