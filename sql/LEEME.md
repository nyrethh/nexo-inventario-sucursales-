# Base de datos PostgreSQL

Para crear la base desde el editor de tu proveedor, ejecuta `nexo-inventario-completa.sql` en una base nueva. Incluye tablas y los registros del Excel. No contiene usuarios ni contraseñas predeterminadas. Crea el administrador después con `npm run admin` siguiendo la guía del proyecto.

Si prefieres separar instalación y datos, ejecuta `01-esquema.sql` y luego `02-datos-excel.sql`, en lugar del archivo completo.

Tablas: `locations`, `users`, `products`, `stock`, `events`, `imports`, `sessions`, `login_attempts`, `schema_migrations`.

Relaciones: cada producto tiene una fila de stock por ubicación. Cada movimiento se asocia a un producto y a su origen y/o destino. Cada operador pertenece a una ubicación; sus sesiones se asocian a su correo. El administrador accede a todas las ubicaciones.

Los disparadores crean las filas de stock y actualizan sus cantidades al insertar movimientos. No edites stock directamente ni cargues los saldos por separado: duplicarías las existencias. Los registros del historial no se pueden editar ni eliminar.

Este paquete proporciona la definición y los datos para reconstruir la base; debes crear el servicio PostgreSQL y configurar su conexión al desplegar.
