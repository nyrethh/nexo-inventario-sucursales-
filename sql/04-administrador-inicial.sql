-- Ejecuta este archivo en el editor SQL de la base que usa Nexo.
-- Cambia los tres valores dentro del bloque antes de ejecutarlo.
-- Para actualizar el nombre o la contraseña, usa el mismo correo.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $admin$
DECLARE
    admin_email TEXT := 'CAMBIA_EL_CORREO';
    admin_name TEXT := 'CAMBIA_EL_NOMBRE';
    admin_password TEXT := 'CAMBIA_LA_CONTRASEÑA';
BEGIN
    admin_email := lower(trim(admin_email));
    admin_name := trim(admin_name);

    IF admin_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        OR length(admin_email) > 160 OR admin_name IN ('', 'CAMBIA_EL_NOMBRE')
        OR length(admin_name) > 160 OR admin_password = 'CAMBIA_LA_CONTRASEÑA'
        OR length(admin_password) < 12 OR octet_length(admin_password) > 72 THEN
        RAISE EXCEPTION 'Configura un correo, un nombre y una contraseña de 12 caracteres como mínimo y 72 bytes como máximo.';
    END IF;

    INSERT INTO users (email, name, role, active, password_hash)
    VALUES (admin_email, admin_name, 'admin', 1, crypt(admin_password, gen_salt('bf', 12)))
    ON CONFLICT (email) DO UPDATE
        SET name = excluded.name, password_hash = excluded.password_hash, active = 1
        WHERE users.role = 'admin';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ese correo ya pertenece a un operador. Usa un correo diferente.';
    END IF;

    DELETE FROM sessions WHERE email = admin_email;
END;
$admin$;
COMMIT;
