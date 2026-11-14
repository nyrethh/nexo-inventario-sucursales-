# Activar el control por serial

Para una base existente, ejecuta `05-seriales-y-sucursales.sql` una sola vez desde el editor SQL de la base PostgreSQL conectada a Nexo. Conserva los registros actuales. Luego despliega el código de esta actualización.

Las entradas piden un serial por moto. Si la cantidad es 4, se solicitan 4 seriales únicos. Las ventas y los traslados seleccionan esos mismos seriales. Un serial vendido permanece en el historial y no se puede reutilizar para una entrada nueva.

En ventas y traslados, elige el producto y el origen y escribe en el buscador de motos. Las coincidencias se filtran mientras escribes por serial, modelo o código. Añade una moto desde los resultados y repite la búsqueda para añadir otras. La cantidad se calcula automáticamente y puedes quitar una selección antes de guardar. Al cambiar el producto o el origen, la selección se vacía. Las entradas mantienen un campo individual por serial.

En Inventario, las existencias anteriores aparecen como pendientes de identificar. El administrador o un operador con permiso de entradas puede usar Completar seriales para asignar los seriales reales a las motos de su ubicación. Esto no registra otra compra ni aumenta el stock. Debes identificar una moto antes de venderla o trasladarla.

Las sucursales reciben únicamente su ubicación, sus existencias, sus motos y los movimientos que les corresponden. Los datos de la otra ubicación y las observaciones del traslado quedan reservados al administrador. Los traslados entre ubicaciones se registran desde una cuenta administradora. Los permisos de venta y entrada siguen siendo configurables para cada operador.

Cada operación acepta hasta 100 motos. Una compra, venta o traslado se guarda completo o se revierte completo si algún serial es inválido, está duplicado o ya no está disponible. Las unidades antiguas vendidas antes de esta actualización permanecen como historial sin serial.

Para una base nueva, `nexo-inventario-completa.sql` ya incluye esta actualización después del inventario original. No ejecutes también el archivo 05 en esa base.
