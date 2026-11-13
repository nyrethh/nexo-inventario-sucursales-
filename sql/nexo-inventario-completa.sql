-- Nexo: instala una base PostgreSQL nueva con el inventario del Excel.
-- Asigna el administrador después con 04-administrador-inicial.sql.

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
