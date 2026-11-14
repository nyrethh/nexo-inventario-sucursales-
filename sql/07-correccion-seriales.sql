-- Ejecutar después de 05-seriales-y-sucursales.sql. Se puede repetir.
BEGIN;
LOCK TABLE schema_migrations IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS serial_corrections (
    id TEXT PRIMARY KEY,
    unit_id BIGINT NOT NULL REFERENCES motorcycle_units(id),
    previous_serial TEXT NOT NULL,
    new_serial TEXT NOT NULL,
    reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 400),
    actor TEXT NOT NULL,
    corrected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS serial_corrections_unit_idx ON serial_corrections(unit_id,corrected_at DESC);

DROP TRIGGER IF EXISTS protect_serial_corrections ON serial_corrections;
CREATE TRIGGER protect_serial_corrections BEFORE UPDATE OR DELETE ON serial_corrections
    FOR EACH ROW EXECUTE FUNCTION immutable_events();

CREATE OR REPLACE FUNCTION correct_motorcycle_serial(
    request_id TEXT, motorcycle_id BIGINT, expected_serial TEXT,
    replacement_serial TEXT, correction_reason TEXT, acting_email TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
    current_unit motorcycle_units%ROWTYPE;
    existing_correction serial_corrections%ROWTYPE;
BEGIN
    PERFORM 1 FROM users WHERE email=acting_email AND role='admin' AND active=1 FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Solo el administrador puede corregir seriales.' USING ERRCODE='42501';
    END IF;
    SELECT * INTO current_unit FROM motorcycle_units WHERE id=motorcycle_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Moto no encontrada.' USING ERRCODE='P0001'; END IF;
    SELECT * INTO existing_correction FROM serial_corrections WHERE id=request_id;
    IF FOUND THEN
        IF existing_correction.unit_id=motorcycle_id AND existing_correction.actor=acting_email
            AND existing_correction.previous_serial=expected_serial AND existing_correction.new_serial=replacement_serial
            AND existing_correction.reason=trim(correction_reason) THEN RETURN false; END IF;
        RAISE EXCEPTION 'El identificador de esta corrección ya está en uso.' USING ERRCODE='P0001';
    END IF;
    IF current_unit.serial IS NULL THEN
        RAISE EXCEPTION 'Identifica primero esta moto con Completar seriales.' USING ERRCODE='P0001';
    END IF;
    IF current_unit.serial IS DISTINCT FROM expected_serial THEN
        RAISE EXCEPTION 'El serial cambió desde que abriste el formulario. Actualiza la página.' USING ERRCODE='P0001';
    END IF;
    IF replacement_serial IS NULL OR replacement_serial<>upper(trim(replacement_serial))
        OR length(replacement_serial) NOT BETWEEN 1 AND 80 OR replacement_serial=current_unit.serial
        OR correction_reason IS NULL OR length(trim(correction_reason)) NOT BETWEEN 3 AND 400 THEN
        RAISE EXCEPTION 'Indica un serial diferente y el motivo de la corrección.' USING ERRCODE='P0001';
    END IF;
    UPDATE motorcycle_units SET serial=replacement_serial WHERE id=motorcycle_id;
    INSERT INTO serial_corrections(id,unit_id,previous_serial,new_serial,reason,actor)
        VALUES(request_id,motorcycle_id,current_unit.serial,replacement_serial,trim(correction_reason),acting_email);
    RETURN true;
END;
$$;
INSERT INTO schema_migrations(version) VALUES('005') ON CONFLICT DO NOTHING;
COMMIT;
