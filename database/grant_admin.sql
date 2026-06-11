-- =============================================================================
-- BeefData - Permisos para usuario MySQL "admin" (ejecutar UNA VEZ como root)
--
-- En MySQL Workbench o CMD:
--   mysql -u root -p < database/grant_admin.sql
--
-- La contraseña debe coincidir con DB_PASSWORD en .env (ej. Adm2026)
-- =============================================================================

CREATE DATABASE IF NOT EXISTS `orion`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

DROP USER IF EXISTS 'admin'@'localhost';
CREATE USER 'admin'@'localhost'
  IDENTIFIED BY 'Adm2026'
  PASSWORD EXPIRE NEVER
  ACCOUNT UNLOCK;

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, INDEX, ALTER,
      CREATE TEMPORARY TABLES, LOCK TABLES, EXECUTE, TRIGGER
  ON `orion`.*
  TO 'admin'@'localhost';

FLUSH PRIVILEGES;

-- Despues ejecuta en la carpeta del proyecto:
--   setup_db.bat
-- o: python setup_db.py
