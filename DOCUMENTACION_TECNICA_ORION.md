# Documentacion Tecnica Integral - ORION (Cut Beef)

## 1) Resumen ejecutivo

ORION es una aplicacion web interna para operacion de desposte que centraliza:

- visualizacion de indicadores operativos (dashboard, mensual, tablero y paradas),
- captura manual de datos operativos,
- proyeccion de tiempos de trabajo,
- gestion de usuarios y seguridad basica por roles,
- envio de reportes PDF por correo,
- sincronizacion de informacion desde Excel (opcional, segun configuracion).

El sistema esta construido sobre arquitectura MVC clasica en Flask, con MySQL/MariaDB como fuente principal y un canal en vivo por Socket.IO (polling) para refresco de pantallas sin recarga manual.

---

## 2) Objetivo funcional del sistema

El objetivo del sistema es proveer una plataforma unificada para:

- controlar productividad (canales/hora, canales/hombre, kilos/hora),
- monitorear merma y paradas,
- soportar planeacion de tiempos proyectados,
- registrar historico operativo,
- habilitar comunicacion por correo con adjuntos estandarizados.

---

## 3) Stack tecnologico y lenguajes

## Backend

- **Lenguaje principal:** Python 3.11+
- **Framework web:** Flask
- **Tiempo real:** Flask-SocketIO + python-socketio + python-engineio
- **Acceso a datos:** PyMySQL (cursor tipo diccionario)
- **Importacion de Excel:** pandas + openpyxl
- **Watcher de archivos:** watchdog
- **Config por entorno:** python-dotenv
- **Seguridad de password:** bcrypt + Werkzeug utilities

## Frontend

- **Estructura:** HTML con plantillas Jinja2
- **Estilos:** Tailwind CSS (CDN) + CSS propio (`static/css/orion.css`)
- **Interactividad:** JavaScript vanilla modular por vista
- **Graficas:** Chart.js
- **Canal en vivo:** Socket.IO client en modo polling

## Base de datos

- **Motor:** MariaDB/MySQL
- **DDL:** SQL directo (`database/schema.sql`)
- **Patron de acceso:** capa `database/db.py` con funciones `fetch_*`, `execute`, `executemany`.

---

## 4) Arquitectura de software

## Estilo arquitectonico

ORION sigue una **arquitectura MVC tradicional**:

- **Controllers:** manejan rutas, autorizacion y respuesta HTTP/JSON.
- **Models:** encapsulan consultas SQL y reglas de negocio por dominio.
- **Views:** plantillas Jinja + JS por pagina para render dinamico.
- **Services:** integraciones transversales (importacion Excel, watcher, email, eventos live).

## Componentes principales

- `app.py`: bootstrap de aplicacion, DB init, import inicial, SocketIO y watcher.
- `config.py`: configuracion central por `.env`.
- `database/db.py`: conexion, esquema y migraciones suaves.
- `controllers/api.py`: API central para dashboard, captura, sync, proyeccion, paradas, etc.
- `services/excel_importer.py`: importador unico de hojas Excel hacia tablas SQL.
- `services/excel_watcher.py`: observa cambios del archivo y dispara resincronizacion.
- `services/live.py`: bus de eventos en vivo (`orion:sync`, `orion:tick`).

## Flujo de arranque (startup)

1. Inicializa DB y esquema.
2. Verifica/crea admin por defecto.
3. Ejecuta import inicial segun reglas:
   - si no hay datos, importa;
   - si hay datos y `IMPORT_ON_START=False`, evita reimportar salvo Excel mas nuevo o archivo diferente.
4. Levanta Flask + SocketIO.
5. Si `WATCHER_ENABLED=True`, arranca watcher sobre `EXCEL_PATH`.

---

## 5) Estructura de carpetas

```text
Orion/
  app.py
  config.py
  requirements.txt
  database/
    db.py
    schema.sql
  controllers/
    auth.py
    api.py
    dashboard.py
    mensual.py
    tablero.py
    paradas.py
    captura.py
    usuarios.py
    email_bot.py
    usabilidad.py
  models/
    user.py
    base_datos.py
    merma_frio.py
    paradas.py
    proyeccion.py
    tiempo_produccion.py
    indicadores.py
    ppto_desp.py
    tablero_ind.py
    reporte_oper.py
    cargos.py
    email_log.py
    sync_log.py
    usabilidad.py
  services/
    excel_importer.py
    excel_watcher.py
    email_bot.py
    live.py
  views/templates/
    *.html
  static/
    js/*.js
    css/orion.css
```

---

## 6) Modelo de datos (tablas y proposito)

## Seguridad y usuarios

- `users`: autenticacion, rol, estado y bandera de cambio obligatorio de password.

## Operacion principal

- `indicadores_orion`: indicadores generales y cumplimiento desde hoja ORION.
- `base_datos`: registros operativos (proceso, tiempos, velocidades, origen manual/excel).
- `merma_frio`: detalle de merma por lote.
- `merma_resumen`: resumen mensual de merma por periodo.
- `ppto_desp`: seguimiento de meta/ejecucion/cumplimiento por mes.
- `tablero_ind`: ejecucion semanal por especie.
- `reporte_operatividad`, `reporte_extras`, `reporte_kilogramos`: bloques de reporte operativo mensual.
- `paradas_std`: eventos de parada con columnas fijas + extras JSON.
- `paradas_categorias`: catalogo dinamico de categorias de parada.
- `tiempo_produccion`: referencias por cliente para estimacion de tiempos.
- `proyecciones`: planeacion/historico editable de tiempos proyectados.

## Soporte y trazabilidad

- `cargos`: base de personal por cargo.
- `cliente_contactos`: contactos email por cliente.
- `email_log`: historial de envios del bot de correo.
- `sync_log`: bitacora de sincronizaciones (manuales, watcher, iniciales).

---

## 7) Capa backend por modulos

## Auth y autorizacion

Archivo: `controllers/auth.py`

- `login_required`: exige sesion valida.
- `admin_required`: restringe rutas a rol admin.
- Login con validacion de hash en `models/user.py`.
- Cambio de password obligatorio en primer ingreso o reset.

## API de negocio

Archivo: `controllers/api.py`

Responsabilidades:

- salud de API (`/api/health`),
- sync manual (`/api/sync`),
- consulta de ultima sync (`/api/sync/last`),
- datos dashboard/mensual/tablero/paradas,
- CRUD de capturas manuales,
- CRUD de proyecciones,
- gestion de opciones auxiliares para formularios.

## API de correo

Archivo: `controllers/email_bot.py`

Incluye:

- sesion de carga por `batch_id`,
- carga/preview/eliminacion de PDFs,
- CRUD de contactos,
- previsualizacion de envio,
- envio en lote con trazabilidad en `email_log`.

## Watcher e importador

- `services/excel_importer.py`: importador unico por hoja, idempotente (`TRUNCATE` o `DELETE origen='excel'` + insert).
- `services/excel_watcher.py`: debounce de eventos de sistema de archivos y sync automatica.
- `models/sync_log.py`: auditoria tecnica de sincronizaciones.

---

## 8) Frontend y logica de UI

## Base de interfaz

Archivo: `views/templates/base.html`

- layout principal con sidebar por modulos,
- inyeccion de scripts globales (`live.js`),
- boton de sincronizacion manual,
- indicador live (`liveDot` / `liveTimestamp`).

## Script global live

Archivo: `static/js/live.js`

- conecta a `/live` con polling forzado (sin websocket upgrade),
- muestra toasts y notifica listeners de modulo,
- helpers reutilizables:
  - formato numerico/fecha/porcentaje,
  - fetch JSON con credenciales,
  - autocomplete generico.

## Scripts por vista

- `dashboard.js`: KPIs, graficas principales, filtro de rango y ajustes.
- `mensual.js`: bloques de indicadores mensuales y visualizaciones.
- `tablero.js`: avance semanal por especie.
- `paradas.js`: vista especializada de paradas.
- `captura_*.js`: formularios de captura manual y validaciones.
- `proyeccion.js`: calculo, guardado y actualizacion de historico de proyecciones.
- `usabilidad.js`: dashboard oculto de adopcion interna.
- `email_bot.js`: flujo completo de adjuntos, destinatarios y envio.

---

## 9) Endpoints HTTP (resumen profesional)

## Vistas HTML (BluePrints)

- `GET /login`
- `GET /`
- `GET /mensual`
- `GET /tablero`
- `GET /paradas/`
- `GET /captura/base-datos`
- `GET /captura/merma-frio`
- `GET /captura/paradas`
- `GET /captura/proyeccion`
- `GET /correo/`
- `GET /usuarios/` (admin)
- `GET /_hidden/usabilidad` (admin + unlock)

## API principal (`/api`)

- Salud/sync:  
  `GET /health`, `POST /sync`, `GET /sync/last`
- Usabilidad interna:  
  `POST /usabilidad/unlock`, `GET /usabilidad/data`
- Datos de vistas:  
  `GET /dashboard`, `GET /tablero`, `GET /mensual`, `GET /paradas-dashboard`
- Datos maestros:
  `GET /personal`, `GET /captura/options`, `GET /captura/paradas/options`, `POST /captura/paradas/categorias`
- Captura base datos:
  `POST /captura/base-datos`, `GET /captura/base-datos`, `DELETE /captura/base-datos/<id>`
- Captura merma:
  `POST /captura/merma-frio`, `GET /captura/merma-frio`, `DELETE /captura/merma-frio/<id>`
- Captura paradas:
  `POST /captura/paradas`, `GET /captura/paradas`, `DELETE /captura/paradas/<id>`
- Tiempo produccion:
  `GET|POST /captura/tiempo-produccion`
- Proyecciones:
  `GET|POST /proyeccion`, `GET /proyeccion/<id>`, `PUT /proyeccion/<id>`, `DELETE /proyeccion/<id>`, `GET /proyeccion/options`

## API correo (`/api/email-bot`)

- `POST /session`
- `POST /upload`
- `GET /uploads/<batch_id>`
- `GET /contactos`, `POST /contactos`, `PUT /contactos/<id>`, `DELETE /contactos/<id>`
- `GET /file/<batch_id>/<doc_type>`, `DELETE /file/<batch_id>/<doc_type>`
- `POST /preview`
- `POST /send`
- `POST /cleanup`
- `GET /historial`

---

## 10) Reglas de negocio clave

## Captura manual vs carga Excel

- Los registros manuales se marcan con `origen='manual'`.
- La sync Excel reemplaza solo registros de `origen='excel'` en tablas mixtas.
- Esto evita perder lo capturado desde la aplicacion.

## Proyecciones

- Se almacenan como cabecera + bloques JSON (`desposte`, `porcionado`).
- Permiten crear, listar, editar y eliminar historicos.

## Paradas

- Mezcla de columnas fijas + categorias extra serializadas en JSON.
- Catalogo de categorias extensible desde UI/API.

## Usabilidad oculta

- Requiere usuario admin.
- Requiere unlock por comando guardado en `USABILITY_DASH_CMD`.
- El flag de unlock vive en sesion (`session['usab_unlock']`).

---

## 11) Configuracion por entorno (`.env`)

Variables principales:

- `FLASK_HOST`, `FLASK_PORT`, `FLASK_DEBUG`, `SECRET_KEY`
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `EXCEL_PATH`, `IMPORT_ON_START`
- `WATCHER_ENABLED`, `WATCHER_DEBOUNCE_SEC`
- `DEFAULT_ADMIN_USER`, `DEFAULT_ADMIN_PASSWORD`, `DEFAULT_RESET_PASSWORD`
- `USABILITY_DASH_CMD`
- SMTP: `MAIL_SERVER/HOST`, `MAIL_PORT`, `MAIL_USE_SSL`, `MAIL_USE_TLS`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM`, `MAIL_FROM_NAME`

Buenas practicas:

- no versionar credenciales reales,
- rotar passwords iniciales al desplegar,
- usar `WATCHER_ENABLED=False` en servidores donde no exista flujo por Excel.

---

## 12) Seguridad y controles

- Sesiones Flask para autenticacion.
- Decoradores de seguridad por ruta (`login_required`, `admin_required`).
- Password hashing con bcrypt.
- Cambio obligatorio de password configurable por usuario.
- Validaciones server-side en payloads de captura y envio.
- Restriccion de tipo/tamanio en adjuntos PDF (max 15 MB).

Riesgos actuales a vigilar:

- uso de variables sensibles en `.env` local,
- falta de rate-limiting en login/API,
- ausencia de CSRF token explicito en algunos POST fetch,
- ausencia de auditoria avanzada de cambios (solo logs funcionales).

---

## 13) Observabilidad, soporte y operacion

- `sync_log` registra fuente, estado, duracion y mensaje de sync.
- `email_log` registra cada envio por destinatario.
- Logs de app via `logging` standard.
- Endpoint `GET /healthz` para chequeo simple de proceso.

Checklist operativo recomendado:

1. Confirmar DB arriba y credenciales validas.
2. Confirmar login admin.
3. Revisar `ultima_sync` en dashboard.
4. Verificar insercion manual de prueba y reflejo en UI.
5. Revisar estado SMTP con envio de prueba.

---

## 14) Convenciones de codigo (estilo senior)

Esta seccion define como documentar y mantener el codigo de forma profesional.

## Convenciones actuales del proyecto

- Python tipado con `from __future__ import annotations`.
- Nombres de funciones descriptivos por dominio.
- SQL explicito y trazable (sin ORM complejo).
- Separacion fuerte por capas (controllers/models/services).

## Estandar recomendado de documentacion de funciones

Para funciones publicas de negocio:

```python
def nombre_funcion(arg1: str, arg2: int) -> dict:
    """
    Proposito:
        Explica que problema resuelve en terminos de negocio.

    Args:
        arg1: Descripcion concreta del parametro.
        arg2: Unidad/validacion esperada.

    Returns:
        Estructura exacta que retorna.

    Raises:
        ValueError: Cuando la validacion de entrada falla.
    """
```

## Estandar recomendado de comentarios

- comentar decisiones, no obviedades,
- explicar formulas, reglas de negocio y edge cases,
- documentar supuestos de data externa (Excel, formatos de hora, etc),
- dejar TODOs con contexto accionable.

## Estandar recomendado para SQL en modelos

- incluir alias claros (`AS`),
- separar consultas por objetivo (KPI, tendencia, detalle),
- preferir filtros explicitos por rango de fecha,
- evitar queries ambiguas dependientes de timezone local.

---

## 15) Flujos funcionales end-to-end

## Flujo A: Login y carga de dashboard

1. Usuario inicia sesion en `/login`.
2. Se valida hash en `models/user.py`.
3. Sesion activa en Flask.
4. Frontend llama `GET /api/dashboard`.
5. API agrega datos de multiples modelos y retorna JSON.
6. `dashboard.js` renderiza KPIs + graficas.

## Flujo B: Captura manual

1. Usuario diligencia formulario de captura.
2. JS envia `POST /api/captura/...`.
3. Modelo valida y persiste con `origen='manual'`.
4. API emite `orion:sync` via live bus.
5. Otras vistas se refrescan automaticamente.

## Flujo C: Sync por Excel (cuando aplica)

1. Cambio de archivo detectado por watcher o boton manual.
2. `import_all()` recorre todas las hojas configuradas.
3. Se actualizan tablas target.
4. Se registra resultado en `sync_log`.
5. Se emite evento live para refresco UI.

## Flujo D: Envio de correo

1. Se crea `batch_id`.
2. Se suben PDFs por tipo.
3. Se define lista de destinatarios y mensaje.
4. Se valida preview.
5. Se envia lote SMTP y se registra en `email_log`.

---

## 16) Recomendaciones de evolucion tecnica

## Prioridad alta

- agregar suite de pruebas (unitarias + integracion API),
- centralizar validaciones con esquemas (pydantic/marshmallow),
- implementar migraciones versionadas (Alembic o SQL version scripts),
- agregar rate-limit y CSRF robusto para endpoints sensibles.

## Prioridad media

- separar capa de repositorios para reducir SQL embebido en modelos,
- incorporar observabilidad estructurada (JSON logs + request id),
- crear contrato OpenAPI para `controllers/api.py`.

## Prioridad baja

- internacionalizacion de mensajes UI,
- empaquetado para despliegue servicio Windows/Linux.

---

## 17) Glosario rapido de dominio

- **Canal/h:** canales procesados por hora.
- **Canal/hombre:** productividad normalizada por operario.
- **Merma frio:** variacion de peso en frio vs caliente.
- **Paradas:** tiempos no productivos por causas operativas.
- **Proyeccion:** planeacion previa de tiempos de proceso.
- **Sync:** proceso de actualizacion de tablas desde fuente externa.

---

## 18) Estado de esta documentacion

- Version: `1.0`
- Tipo: documentacion tecnica integral de codigo y arquitectura.
- Cobertura: backend, frontend, base de datos, seguridad, operaciones y estandar de documentacion senior.

