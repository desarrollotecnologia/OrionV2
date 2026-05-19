-- Crear usuario MySQL "admin" para la base orion (ejecutar como ROOT una sola vez)
-- mysql -u root -p < database/grant_admin.sql
--
-- Cambia la contrasena abajo si no usas la misma que en .env (DB_PASSWORD)

CREATE DATABASE IF NOT EXISTS `orion`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

DROP USER IF EXISTS 'admin'@'localhost';
CREATE USER 'admin'@'localhost' IDENTIFIED BY 'Admin2026*';

GRANT ALL PRIVILEGES ON `orion`.* TO 'admin'@'localhost';
FLUSH PRIVILEGES;
