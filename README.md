# ORION - Aplicativo alfa

Aplicacion local que toma como base el archivo `ORION.xlsx` y lo expone
como un dashboard web en vivo. Cuando alguien edita y guarda el Excel,
la aplicacion detecta el cambio, vuelve a leerlo, lo guarda en MySQL y
emite un evento por websocket para que la interfaz se refresque
automaticamente sin recargar.

## Stack

- **Backend:** Python 3.11+ con Flask y Flask-SocketIO (websockets/threading)
- **Base de datos:** MariaDB 10.4 (XAMPP) - driver PyMySQL puro Python.
  Funciona tambien con MySQL 5.7+/8.x cambiando solo la conexion en `.env`.
- **Importacion:** pandas + openpyxl
- **Vigilancia archivo:** watchdog
- **Frontend:** HTML + Tailwind CSS (CDN) + Chart.js + Socket.IO
- **Arquitectura:** MVC tradicional

```
Orion/
  app.py                    Punto de entrada
  config.py                 Configuracion (.env)
  requirements.txt
  database/                 DDL + capa de acceso
  models/                   Capa M
  controllers/              Capa C (Flask blueprints)
  views/templates/          Capa V (Jinja2)
  static/                   CSS / JS / assets
  services/                 Importador del Excel + watcher + bus de eventos
```

## Instalacion

1. Instala XAMPP (incluye MariaDB sin contrasena en el puerto 3306).
2. Clona/copia esta carpeta y entra en ella.
3. Instala dependencias:

   ```powershell
   pip install -r requirements.txt
   ```

4. Copia `.env.example` como `.env`. Por defecto ya esta configurado
   para MariaDB de XAMPP (root, sin contrasena). Solo ajusta
   `EXCEL_PATH` si tu archivo esta en otra ruta.

5. Asegurate de tener el archivo `ORION.xlsx` en la ruta indicada.

## Ejecucion

Doble clic sobre `start.bat`, o desde una consola:

```powershell
python app.py
```

Al iniciar:

- Crea la base de datos `orion` si no existe.
- Aplica el esquema (`database/schema.sql`).
- Crea el usuario por defecto **admin / admin**.
- Importa el Excel a MySQL.
- Arranca el servidor en `http://127.0.0.1:5000` y un watcher que
  vigila `ORION.xlsx`.

Cada vez que guardes el Excel se ejecuta una resincronizacion y se
emite el evento `orion:sync` por websocket. Las vistas del dashboard,
mensual y tablero se refrescan solas.

## Pantallas

- **/login** - Inicio de sesion (admin / admin por defecto).
- **/** Dashboard principal con KPIs (mermas, tiempo merma frio,
  tiempo de produccion, PPTO Canales), grafica de seguimiento de
  ejecucion, velocidades por proceso, paradas (categoria + tendencia)
  y resumen del dia.
- **/mensual** - Mes/anio/fecha, indicadores Bovinos/Porcinos,
  cumplimiento de metas (HOY y ACUMULADO), operatividad, cifras del
  mes, extras, kilogramos, merma mensual, paradas y velocidades.
- **/tablero** - Tablero de indicadores semanal por especie
  (Bovinos / Porcinos) con grafica meta vs ejecucion + cumplimiento.

## Hojas del Excel utilizadas

- `ORION` -> indicadores generales del mes
- `BASE DATOS` -> registros operativos (velocidades, kilos, canales)
- `MERMA FRIO`, `MERMA FRIO% 25-26`, `MERMA FRIO% 24-25` -> merma frio
  detalle y resumen mensual
- `PPTO DESP.` -> seguimiento ejecucion presupuesto canales (mes)
- `TABLERO IND.` -> seguimiento semanal por especie
- `REPORTEOPER` -> operatividad planta, extras y kilogramos
- `PARADASTD` -> paradas estandar por dia
- `TIEMPO PRODUCCION` -> tiempos por cliente
- `CARGOS` -> personal

Las hojas `OPERATIVIDAD`, `CRONOGRAMA MENSUAL`, `FILTROACUMULADO` y
`PPTO PORC.` se ignoran a peticion del usuario.

## Sincronizacion manual

En la barra lateral hay un boton **Sincronizar Excel** que llama a
`/api/sync` y reimporta inmediatamente el archivo, ademas del watcher
que ya lo hace en cuanto se detecta un cambio en disco.
