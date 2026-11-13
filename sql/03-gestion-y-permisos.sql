-- Actualización para bases que ya tienen el inventario. Se puede repetir.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL
    DEFAULT ARRAY['venta','compra','traslado']::TEXT[]
    CHECK (permissions <@ ARRAY['venta','compra','traslado']::TEXT[]);
ALTER TABLE products ADD COLUMN IF NOT EXISTS active INTEGER NOT NULL DEFAULT 1
    CHECK (active IN (0,1));
INSERT INTO schema_migrations(version) VALUES ('002') ON CONFLICT DO NOTHING;
COMMIT;
