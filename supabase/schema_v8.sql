-- =====================================================================
-- schema_v8.sql · DESCRIPCIÓN DE PRODUCTOS (se muestra en la ventana flotante de la tienda)
-- Ejecuta después de schema_v7.sql. Es seguro repetirlo.
-- =====================================================================
alter table products add column if not exists description text;
