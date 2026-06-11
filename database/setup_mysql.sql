-- =============================================================================
-- ORION - Instalacion manual en MySQL / MariaDB (sin XAMPP)
-- Ejecutar como usuario ROOT desde consola:
--   mysql -u root -p < database/setup_mysql.sql
-- O pegar en MySQL Workbench / cliente SQL conectado como root.
--
-- ANTES DE EJECUTAR: cambia 'CAMBIA_ESTA_CONTRASENA' por tu contraseña real.
-- =============================================================================

-- 1) Base de datos
CREATE DATABASE IF NOT EXISTS `orion`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 2) Usuario de aplicacion (siempre con contraseña; no usar root en la app)
--    Nombre sugerido: orion_admin  (distinto del admin del login web /login)
DROP USER IF EXISTS 'orion_admin'@'localhost';
CREATE USER 'orion_admin'@'localhost'
  IDENTIFIED BY 'CAMBIA_ESTA_CONTRASENA'
  PASSWORD EXPIRE NEVER
  ACCOUNT UNLOCK;

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, INDEX, ALTER,
      CREATE TEMPORARY TABLES, LOCK TABLES, EXECUTE, TRIGGER
  ON `orion`.*
  TO 'orion_admin'@'localhost';

-- Si la app corre en otra maquina de la red, descomenta y ajusta la IP:
-- CREATE USER 'orion_admin'@'192.168.1.%' IDENTIFIED BY 'CAMBIA_ESTA_CONTRASENA';
-- GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, INDEX, ALTER,
--       CREATE TEMPORARY TABLES, LOCK TABLES, EXECUTE, TRIGGER
--   ON `orion`.* TO 'orion_admin'@'192.168.1.%';

FLUSH PRIVILEGES;

-- 3) Tablas (mismo esquema que importa el Excel)
USE `orion`;

CREATE TABLE IF NOT EXISTS users (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(64)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    nombre          VARCHAR(150) NULL,
    rol             VARCHAR(50)  NOT NULL DEFAULT 'admin',
    activo          TINYINT(1)   NOT NULL DEFAULT 1,
    creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS indicadores_orion (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    mes             INT          NULL,
    anio            INT          NULL,
    fecha           DATE         NULL,
    seccion         VARCHAR(50)  NULL,
    bloque          VARCHAR(50)  NULL,
    item            INT          NULL,
    criterio        VARCHAR(150) NULL,
    hoy             DOUBLE       NULL,
    acumulado       DOUBLE       NULL,
    meta            DOUBLE       NULL,
    ejecutado       DOUBLE       NULL,
    cumplimiento    DOUBLE       NULL,
    cantidad        DOUBLE       NULL,
    porcentaje      DOUBLE       NULL,
    actualizado_en  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_seccion (seccion),
    INDEX idx_bloque (bloque)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS base_datos (
    id                       INT AUTO_INCREMENT PRIMARY KEY,
    item                     INT          NULL,
    fecha                    DATE         NULL,
    mes                      INT          NULL,
    anio                     INT          NULL,
    cliente                  VARCHAR(200) NULL,
    especie                  VARCHAR(50)  NULL,
    limpieza                 VARCHAR(50)  NULL,
    proceso                  VARCHAR(80)  NULL,
    operarios                INT          NULL,
    lote                     VARCHAR(80)  NULL,
    canales                  DOUBLE       NULL,
    kilos                    DOUBLE       NULL,
    hora_inicio              VARCHAR(20)  NULL,
    hora_fin                 VARCHAR(20)  NULL,
    tiempo_reposo            VARCHAR(20)  NULL,
    tiempo_total             VARCHAR(20)  NULL,
    velocidad_canal_h        DOUBLE       NULL,
    velocidad_kilos_h        DOUBLE       NULL,
    velocidad_canal_hh       DOUBLE       NULL,
    mes_texto                VARCHAR(20)  NULL,
    origen                   VARCHAR(20)  NOT NULL DEFAULT 'excel',
    creado_en                DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_fecha (fecha),
    INDEX idx_cliente (cliente),
    INDEX idx_especie (especie),
    INDEX idx_proceso (proceso),
    INDEX idx_origen (origen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS merma_frio (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    item              INT          NULL,
    fecha_beneficio   DATE         NULL,
    fecha_produccion  DATE         NULL,
    mes               INT          NULL,
    cliente           VARCHAR(200) NULL,
    especie           VARCHAR(50)  NULL,
    cant_machos       DOUBLE       NULL,
    cant_hembras      DOUBLE       NULL,
    total_canales     DOUBLE       NULL,
    lote              VARCHAR(80)  NULL,
    peso_caliente     DOUBLE       NULL,
    peso_frio         DOUBLE       NULL,
    merma_frio        DOUBLE       NULL,
    cava              VARCHAR(50)  NULL,
    observaciones     VARCHAR(255) NULL,
    mes_texto         VARCHAR(20)  NULL,
    anio              INT          NULL,
    fecha             DATE         NULL,
    origen            VARCHAR(20)  NOT NULL DEFAULT 'excel',
    creado_en         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_fecha_prod (fecha_produccion),
    INDEX idx_cliente (cliente),
    INDEX idx_origen (origen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS merma_resumen (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    item                INT          NULL,
    anio                INT          NULL,
    mes_texto           VARCHAR(20)  NULL,
    mes_num             INT          NULL,
    merma_prom_mensual  DOUBLE       NULL,
    merma_prom_anual    DOUBLE       NULL,
    comportamiento      DOUBLE       NULL,
    periodo             VARCHAR(10)  NULL,
    INDEX idx_periodo (periodo),
    INDEX idx_anio_mes (anio, mes_num)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ppto_desp (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    anio            INT          NULL,
    mes_texto       VARCHAR(20)  NULL,
    mes_num         INT          NULL,
    meta            DOUBLE       NULL,
    ejecucion       DOUBLE       NULL,
    cumplimiento    DOUBLE       NULL,
    UNIQUE KEY uniq_anio_mes (anio, mes_num),
    INDEX idx_mes (mes_num)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tablero_ind (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    especie         VARCHAR(50)  NULL,
    semana          INT          NULL,
    meta            DOUBLE       NULL,
    ejecucion       DOUBLE       NULL,
    cumplimiento    DOUBLE       NULL,
    UNIQUE KEY uniq_especie_semana (especie, semana),
    INDEX idx_especie (especie)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reporte_operatividad (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    item            VARCHAR(20)  NULL,
    criterio        VARCHAR(150) NULL,
    cant_personas   DOUBLE       NULL,
    porcentaje      DOUBLE       NULL,
    operarios       VARCHAR(150) NULL,
    INDEX idx_criterio (criterio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reporte_extras (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    item                INT          NULL,
    mes_texto           VARCHAR(20)  NULL,
    mes_num             INT          NULL,
    extras              DOUBLE       NULL,
    promedio_he_dia     DOUBLE       NULL,
    promedio_dia_oper   DOUBLE       NULL,
    INDEX idx_mes (mes_num)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reporte_kilogramos (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    item            INT          NULL,
    concepto        VARCHAR(150) NULL,
    mes_texto       VARCHAR(20)  NULL,
    mes_num         INT          NULL,
    kilogramos      DOUBLE       NULL,
    INDEX idx_concepto (concepto),
    INDEX idx_mes (mes_num)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS paradas_std (
    id                          INT AUTO_INCREMENT PRIMARY KEY,
    fecha                       DATE NULL,
    tardanza_inicio             DOUBLE NULL,
    lavado_desinfeccion         DOUBLE NULL,
    dano_sistema_1              DOUBLE NULL,
    dano_sistema_2              DOUBLE NULL,
    fallas_electricas           DOUBLE NULL,
    fallas_sistema              DOUBLE NULL,
    falta_canastillas           DOUBLE NULL,
    parada_alimentacion         DOUBLE NULL,
    recepcion_entrega           DOUBLE NULL,
    reunion_magica              DOUBLE NULL,
    total                       DOUBLE NULL,
    INDEX idx_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tiempo_produccion (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    cliente             VARCHAR(200) NULL,
    canales             DOUBLE NULL,
    canales_promedio    DOUBLE NULL,
    tiempo_promedio     VARCHAR(20) NULL,
    tiempo_estimado     VARCHAR(20) NULL,
    INDEX idx_cliente (cliente)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cargos (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    numero      INT          NULL,
    nombre      VARCHAR(150) NULL,
    cargo       VARCHAR(120) NULL,
    INDEX idx_cargo (cargo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS proyecciones (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    fecha           DATE         NOT NULL,
    titulo          VARCHAR(160) NULL,
    hora_inicio     VARCHAR(8)   NULL,
    descanso        VARCHAR(8)   NULL,
    parada          VARCHAR(8)   NULL,
    duracion        VARCHAR(8)   NULL,
    salida          VARCHAR(8)   NULL,
    tiempo_planta   VARCHAR(8)   NULL,
    aplica_comidas  VARCHAR(3)   NULL,
    total_canales   INT          NULL,
    total_operarios INT          NULL,
    total_tiempo    VARCHAR(8)   NULL,
    desposte        JSON         NULL,
    porcionado      JSON         NULL,
    creado_por      VARCHAR(150) NULL,
    creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sync_log (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    sincronizado_en DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archivo         VARCHAR(255) NULL,
    estado          VARCHAR(50)  NOT NULL,
    mensaje         TEXT         NULL,
    duracion_seg    DOUBLE       NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Fin: las filas del Excel se cargan con: python -m services.excel_importer
-- El login web (admin) se crea al primer arranque: python app.py
