BEGIN;
CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE locations (id TEXT PRIMARY KEY, name TEXT NOT NULL);
INSERT INTO locations VALUES ('Deposito Principal','Depósito Principal'),('Sucursal 1','Sucursal 1'),('Sucursal 2','Sucursal 2');
CREATE TABLE users (
 email TEXT PRIMARY KEY CHECK(email=lower(email)), name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','operador')),
 location TEXT REFERENCES locations(id), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 password_hash TEXT NOT NULL,
 permissions TEXT[] NOT NULL DEFAULT ARRAY['venta','compra','traslado']::TEXT[]
    CHECK (permissions <@ ARRAY['venta','compra','traslado']::TEXT[]),
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
INSERT INTO schema_migrations(version) VALUES ('001'), ('002');
COMMIT;
