-- Ejecutar una vez en bases existentes. Conserva los movimientos anteriores.
BEGIN;
CREATE TABLE motorcycle_units (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code TEXT NOT NULL REFERENCES products(code),
    serial TEXT UNIQUE CHECK (serial IS NULL OR (serial=upper(trim(serial)) AND length(serial) BETWEEN 1 AND 80)),
    location TEXT REFERENCES locations(id),
    sold BOOLEAN NOT NULL DEFAULT false,
    CHECK ((sold AND location IS NULL) OR (NOT sold AND location IS NOT NULL))
);
CREATE INDEX motorcycle_units_inventory_idx ON motorcycle_units(code,location) WHERE NOT sold;
ALTER TABLE events ADD COLUMN serials TEXT[];
CREATE TABLE event_units (
    event_id TEXT REFERENCES events(id),
    unit_id BIGINT REFERENCES motorcycle_units(id),
    PRIMARY KEY(event_id,unit_id)
);

CREATE FUNCTION initialize_pending_units() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO motorcycle_units(code,location)
    SELECT s.code,s.location FROM stock s
    CROSS JOIN LATERAL generate_series(1, s.quantity -
        (SELECT count(*)::integer FROM motorcycle_units u WHERE u.code=s.code AND u.location=s.location AND NOT u.sold)) n;
END;
$$;
SELECT initialize_pending_units();

CREATE FUNCTION process_serialized_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    selected_ids BIGINT[];
    serial_value TEXT;
    selected_id BIGINT;
BEGIN
    -- El importador original conserva el historial sin inventar seriales.
    IF NEW.serials IS NULL AND NEW.actor='Importación Excel' THEN RETURN NEW; END IF;
    IF NEW.serials IS NULL OR cardinality(NEW.serials)<>NEW.quantity OR NEW.quantity>100 THEN
        RAISE EXCEPTION 'Debes indicar un serial por cada moto.' USING ERRCODE='P0001';
    END IF;
    IF EXISTS(SELECT 1 FROM unnest(NEW.serials) value
        WHERE value IS NULL OR value<>upper(trim(value)) OR length(value) NOT BETWEEN 1 AND 80)
        OR (SELECT count(DISTINCT value) FROM unnest(NEW.serials) value)<>NEW.quantity THEN
        RAISE EXCEPTION 'Los seriales deben ser válidos y distintos.' USING ERRCODE='P0001';
    END IF;
    -- Mismo orden de bloqueo que la actualización del stock.
    PERFORM 1 FROM stock WHERE code=NEW.code AND location IN(NEW.origin,NEW.destination) ORDER BY location FOR UPDATE;
    IF NEW.kind='compra' THEN
        FOREACH serial_value IN ARRAY NEW.serials LOOP
            INSERT INTO motorcycle_units(code,serial,location) VALUES(NEW.code,serial_value,NEW.destination);
        END LOOP;
    ELSE
        SELECT array_agg(id ORDER BY id) INTO selected_ids FROM (
            SELECT id FROM motorcycle_units
            WHERE code=NEW.code AND serial=ANY(NEW.serials) AND location=NEW.origin AND NOT sold
            ORDER BY id FOR UPDATE
        ) selected;
        IF COALESCE(cardinality(selected_ids),0)<>NEW.quantity THEN
            RAISE EXCEPTION 'Alguna moto ya no está disponible en tu ubicación. Actualiza el inventario.' USING ERRCODE='P0001';
        END IF;
        UPDATE motorcycle_units SET location=NEW.destination,sold=(NEW.kind='venta') WHERE id=ANY(selected_ids);
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_event_serials BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION process_serialized_event();
CREATE FUNCTION link_event_units() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO event_units(event_id,unit_id)
    SELECT NEW.id,id FROM motorcycle_units WHERE serial=ANY(NEW.serials);
    RETURN NEW;
END;
$$;
CREATE TRIGGER link_serials AFTER INSERT ON events FOR EACH ROW EXECUTE FUNCTION link_event_units();

CREATE FUNCTION identify_pending_units(product_code TEXT, location_id TEXT, serial_values TEXT[]) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE selected_ids BIGINT[]; affected INTEGER;
BEGIN
    IF cardinality(serial_values) NOT BETWEEN 1 AND 100 OR serial_values IS NULL
        OR EXISTS(SELECT 1 FROM unnest(serial_values) value WHERE value IS NULL OR value<>upper(trim(value)) OR length(value) NOT BETWEEN 1 AND 80)
        OR (SELECT count(DISTINCT value) FROM unnest(serial_values) value)<>cardinality(serial_values) THEN
        RAISE EXCEPTION 'Indica seriales válidos y distintos.' USING ERRCODE='P0001';
    END IF;
    PERFORM 1 FROM stock WHERE code=product_code AND location=location_id FOR UPDATE;
    SELECT array_agg(id ORDER BY id) INTO selected_ids FROM (
        SELECT id FROM motorcycle_units WHERE code=product_code AND location=location_id AND serial IS NULL AND NOT sold
        ORDER BY id LIMIT cardinality(serial_values) FOR UPDATE
    ) pending;
    IF COALESCE(cardinality(selected_ids),0)<>cardinality(serial_values) THEN
        RAISE EXCEPTION 'La cantidad supera las unidades pendientes de identificar.' USING ERRCODE='P0001';
    END IF;
    UPDATE motorcycle_units SET serial=serial_values[array_position(selected_ids,id)] WHERE id=ANY(selected_ids);
    GET DIAGNOSTICS affected=ROW_COUNT;
    RETURN affected;
END;
$$;
INSERT INTO schema_migrations(version) VALUES('003');
COMMIT;
