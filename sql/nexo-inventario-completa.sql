-- Nexo: base nueva. Administrador en 04-administrador-inicial.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE locations (id TEXT PRIMARY KEY, name TEXT NOT NULL);
INSERT INTO locations VALUES ('Deposito Principal','Depósito Principal'),('Sucursal 1','Sucursal 1'),('Sucursal 2','Sucursal 2');
CREATE TABLE users (
 email TEXT PRIMARY KEY CHECK(email=lower(email)), name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','operador')),
 location TEXT REFERENCES locations(id), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 password_hash TEXT NOT NULL,
 permissions TEXT[] NOT NULL DEFAULT ARRAY['venta']::TEXT[]
    CHECK (permissions <@ ARRAY['venta','compra','traslado','inventario','historial_ventas','reportes']::TEXT[]),
 CHECK(role='admin' OR location IS NOT NULL)
);
CREATE TABLE products (code TEXT PRIMARY KEY, name TEXT NOT NULL, minimum INTEGER NOT NULL DEFAULT 2 CHECK(minimum>=0),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
CREATE TABLE stock (code TEXT REFERENCES products(code), location TEXT REFERENCES locations(id), quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity>=0), PRIMARY KEY(code,location));
CREATE FUNCTION initialize_stock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO stock(code,location) SELECT NEW.code,id FROM locations; RETURN NEW; END;
$$;
CREATE TRIGGER new_product AFTER INSERT ON products FOR EACH ROW EXECUTE FUNCTION initialize_stock();
CREATE TABLE events (
 id TEXT PRIMARY KEY, date TIMESTAMPTZ NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('compra','venta','traslado')),
 code TEXT NOT NULL REFERENCES products(code), quantity INTEGER NOT NULL CHECK(quantity>0),
 origin TEXT REFERENCES locations(id), destination TEXT REFERENCES locations(id),
 supplier TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL,
 CHECK((kind='compra' AND origin IS NULL AND destination IS NOT NULL) OR (kind='venta' AND origin IS NOT NULL AND destination IS NULL) OR (kind='traslado' AND origin IS NOT NULL AND destination IS NOT NULL AND origin<>destination))
);
CREATE FUNCTION apply_inventory_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- Se bloquean ambas ubicaciones en orden para evitar pérdidas por concurrencia.
 PERFORM 1 FROM stock WHERE code=NEW.code AND location IN (NEW.origin,NEW.destination) ORDER BY location FOR UPDATE;
 UPDATE stock SET quantity=quantity-NEW.quantity WHERE code=NEW.code AND location=NEW.origin;
 UPDATE stock SET quantity=quantity+NEW.quantity WHERE code=NEW.code AND location=NEW.destination;
 RETURN NEW;
END;
$$;
CREATE TRIGGER apply_event AFTER INSERT ON events FOR EACH ROW EXECUTE FUNCTION apply_inventory_event();
CREATE FUNCTION immutable_events() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'El historial de inventario es inmutable'; END;
$$;
CREATE TRIGGER protect_events BEFORE UPDATE OR DELETE ON events FOR EACH ROW EXECUTE FUNCTION immutable_events();
CREATE TABLE imports (id TEXT PRIMARY KEY, date TEXT NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at TIMESTAMPTZ NOT NULL);
CREATE INDEX events_date_idx ON events(date DESC);
CREATE INDEX events_origin_idx ON events(origin);
CREATE INDEX events_destination_idx ON events(destination);
INSERT INTO schema_migrations(version) VALUES ('001'), ('002'), ('004');
COMMIT;

-- Datos originales del Excel: 11 productos y 17 movimientos. Ejecutar una sola vez.
BEGIN;
INSERT INTO products(code,name,minimum) VALUES('MOT001','GN 150 AZUL','2');
INSERT INTO products(code,name,minimum) VALUES('MOT002','EK OWEN ROJA','2');
INSERT INTO products(code,name,minimum) VALUES('MOT003','EK EXPRESS II','2');
INSERT INTO products(code,name,minimum) VALUES('MOT004','EK EXPRESS ROJA','2');
INSERT INTO products(code,name,minimum) VALUES('MOT005','EK EXPRESS AZUL','2');
INSERT INTO products(code,name,minimum) VALUES('MOT006','FORZA 150','2');
INSERT INTO products(code,name,minimum) VALUES('MOT007','FORZA 205','2');
INSERT INTO products(code,name,minimum) VALUES('MOT008','FORZA SPEED','2');
INSERT INTO products(code,name,minimum) VALUES('MOT009','GN 150 ROJA','2');
INSERT INTO products(code,name,minimum) VALUES('MOT010','SUZUKI 100 AZUL','2');
INSERT INTO products(code,name,minimum) VALUES('MOT011','SUZUKI 100 ROJA','2');
INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,actor) VALUES('Compras0','2026-11-09T12:33:32-04:00','compra','MOT001','6',NULL,'Deposito Principal','EMPIRE','Importación Excel');
INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,actor) VALUES('Compras1','2026-11-09T12:33:43-04:00','compra','MOT002','4',NULL,'Deposito Principal','EMPIRE','Importación Excel');
INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,actor) VALUES('Compras2','2026-11-09T12:33:56-04:00','compra','MOT006','10',NULL,'Deposito Principal','FORZA','Importación Excel');
INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,actor) VALUES('Transferencias0','2026-11-09T12:34:35-04:00','traslado','MOT001','3','Deposito Principal','Sucursal 1','','Importación Excel');
INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,actor) VALUES('Transferencias1','2026-11-09T12:34:46-04:00','traslado','MOT001','3','Deposito Principal','Sucursal 2','','Importación Excel');
INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,actor) VALUES('Transferencias2','2026-11-09T12:35:09-04:00','traslado','MOT002','4','Deposito Principal','Sucursal 2','','Importación Excel');
INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,actor) VALUES('Transferencias3','2026-11-09T12:35:23-04:00','traslado','MOT002','1','Sucursal 2','Sucursal 1','','Importación Excel');
INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,actor) VALUES('Transferencias4','2026-11-09T12:35:44-04:00','traslado','MOT006','6','Deposito Principal','Sucursal 1','','Importación Excel');
INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,actor) VALUES('Ventas0','2026-11-09T12:37:42-04:00','venta','MOT001','1','Sucursal 1',NULL,'','Importación Excel');
INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,actor) VALUES('Ventas1','2026-11-09T12:37:57-04:00','venta','MOT002','1','Sucursal 2',NULL,'','Importación Excel');
INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,actor) VALUES('Ventas2','2026-11-09T12:38:14-04:00','venta','MOT006','1','Sucursal 1',NULL,'','Importación Excel');
INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,actor) VALUES('Ventas3','2026-11-09T12:54:01-04:00','venta','MOT001','1','Sucursal 1',NULL,'','Importación Excel');
INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,actor) VALUES('Ventas4','2026-11-09T12:54:26-04:00','venta','MOT001','1','Sucursal 2',NULL,'','Importación Excel');
INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,actor) VALUES('Ventas5','2026-11-09T14:22:06-04:00','venta','MOT002','1','Sucursal 2',NULL,'','Importación Excel');
INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,actor) VALUES('Ventas6','2026-11-09T14:23:14-04:00','venta','MOT006','1','Sucursal 1',NULL,'','Importación Excel');
INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,actor) VALUES('Ventas7','2026-11-10T10:53:48-04:00','venta','MOT006','1','Sucursal 1',NULL,'','Importación Excel');
INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,actor) VALUES('Ventas8','2026-11-10T11:05:26-04:00','venta','MOT006','1','Sucursal 1',NULL,'','Importación Excel');
INSERT INTO imports VALUES('excel-v1',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'));
COMMIT;

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
