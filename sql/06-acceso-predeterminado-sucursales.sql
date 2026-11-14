-- Si pgAdmin muestra 25P02, ejecuta ROLLBACK; por separado antes de este archivo.
-- Esta actualización se puede repetir y conserva los permisos ajustados después.
BEGIN;
LOCK TABLE schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $migration$
BEGIN
    IF EXISTS (SELECT 1 FROM schema_migrations WHERE version='004') THEN
        RAISE NOTICE 'El perfil de sucursales ya está actualizado.';
        RETURN;
    END IF;

    ALTER TABLE users ALTER COLUMN permissions SET DEFAULT ARRAY['venta']::TEXT[];
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_permissions_check;
    ALTER TABLE users ADD CONSTRAINT users_permissions_check CHECK(
        permissions <@ ARRAY['venta','compra','traslado','inventario','historial_ventas','reportes']::TEXT[]
    );
    UPDATE users SET permissions=ARRAY['venta']::TEXT[]
        WHERE role='operador' AND location IN ('Sucursal 1','Sucursal 2');
    INSERT INTO schema_migrations(version) VALUES('004');
END;
$migration$;
COMMIT;
