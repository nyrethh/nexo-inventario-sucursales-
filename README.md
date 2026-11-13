# Nexo · Inventario multisucursal para Vercel

Sistema web para **Depósito Principal, Sucursal 1 y Sucursal 2**, con administrador y operadores. Funciona en teléfono y escritorio. Esta entrega utiliza **correo y contraseña propios**, sin cuentas ni servicios de ChatGPT.

## Qué contiene

- Interfaz de acceso, dashboard con gráficas, existencias, productos, entradas/compras, ventas y traslados.
- Resumen de ventas, resumen de existencias e historial con filtros de fecha y ubicación; exportación CSV.
- Administración de usuarios: crear, editar, activar, desactivar y restablecer contraseñas.
- Cambio de contraseña desde la cuenta del usuario.
- API con permisos comprobados en el servidor. Un operador solo ve el stock de su ubicación y registra salidas desde ella; el administrador ve todo.
- Base PostgreSQL con actualización atómica del stock, bloqueo de registros durante los movimientos y protección contra cantidades negativas.
- Contraseñas protegidas con scrypt; sesiones aleatorias guardadas como hashes, cookies HttpOnly y Secure en producción, vencimiento de siete días y límite de intentos de inicio de sesión.
- SQL con los datos extraídos del Excel original: **11 productos, 3 compras, 5 traslados y 9 ventas**.

El Excel original no tiene precios. Los resúmenes muestran cantidades, no ingresos monetarios. El mínimo de stock inicial es de 2 unidades por producto y es una referencia global. Los movimientos guardados son inmutables; esta entrega no incluye anulaciones, devoluciones ni ajustes de inventario. El historial registra el correo que realizó la operación.

## 1. Crear la base de datos

Necesitas una base **PostgreSQL** alojada de forma persistente. Puedes utilizar tu proveedor PostgreSQL o uno conectado a Vercel. Vercel ejecutará la web y la API; los registros se guardarán en PostgreSQL, no en archivos dentro de Vercel.

El archivo **`sql/nexo-inventario-completa.sql`** contiene el esquema completo y los datos del Excel. Puedes ejecutarlo en el editor SQL de tu proveedor, sobre una base nueva.

Alternativamente, utiliza los archivos por separado, en este orden:

1. `sql/01-esquema.sql`: tablas, relaciones, índices, funciones y disparadores.
2. `sql/02-datos-excel.sql`: productos y movimientos originales.

**El SQL completo y los archivos separados son alternativas. No ejecutes ambos.** El esquema inicial se ejecuta una sola vez. Los datos de stock se calculan automáticamente al insertar los movimientos; no debes cargar un saldo inicial adicional.

Resultado esperado después de cargar los datos:

| Ubicación | Unidades disponibles |
|---|---:|
| Depósito Principal | 4 |
| Sucursal 1 | 4 |
| Sucursal 2 | 3 |
| Total | 11 |

Las ventas acumuladas son 9 unidades: 6 en Sucursal 1 y 3 en Sucursal 2. Las horas se muestran y filtran en el horario de Caracas.

## 2. Preparar el proyecto en tu computadora

Instala Node.js 22.13 o posterior de la versión 22. Abre una terminal dentro de esta carpeta y ejecuta:

```powershell
npm ci
Copy-Item .env.example .env.local
```

Edita `.env.local` y configura:

```dotenv
DATABASE_URL=postgresql://USUARIO:CLAVE@HOST:5432/BASE?sslmode=require
APP_URL=http://localhost:3000
```

Usa el URL de conexión proporcionado por tu proveedor. Si ofrece una conexión con pool, úsala para `DATABASE_URL`. Si requiere otra conexión para instalar el esquema, configúrala como `DATABASE_URL_UNPOOLED`.

Si todavía no ejecutaste el SQL manualmente, ejecuta:

```powershell
npm run db:setup
```

Este comando instala el esquema y carga los datos del Excel. Si ya están instalados, los conserva y evita duplicarlos. Para instalar únicamente el esquema sin datos: `npm run db:setup -- --schema-only`. En ese caso podrás importar el Excel desde el dashboard.

## 3. Asignar el administrador desde SQL

Si ya tienes datos en la base, ejecuta primero `sql/03-gestion-y-permisos.sql` en pgAdmin o en el editor SQL del proveedor. Una instalación nueva con `sql/nexo-inventario-completa.sql` ya incluye estos campos.

Abre `sql/04-administrador-inicial.sql` en el editor SQL de la base que utiliza `DATABASE_URL`. Cambia allí el correo, el nombre y la contraseña. Ejecuta el archivo completo. El SQL asigna el rol `admin` y almacena un hash usando la extensión PostgreSQL `pgcrypto`. Usa una contraseña de al menos 12 caracteres y hasta 72 bytes. Conserva en el repositorio la plantilla sin credenciales.

Para actualizar la cuenta, repite el SQL con el mismo correo y los valores nuevos. Para cambiar el correo, editar otros usuarios o desactivar una cuenta, entra en **Usuarios**. Cambiar el correo o la contraseña cierra las sesiones de esa cuenta.

En Vercel, haz estos cambios en el editor SQL del proveedor de PostgreSQL conectado a tu proyecto. Luego entra a Nexo con el correo y la contraseña que configuraste.

Para iniciar el sitio en tu computadora puedes usar `Iniciar-Nexo.cmd` y abrir `http://localhost:3000`.

## 4. Gestionar usuarios y productos

En **Usuarios → Crear usuario**, el administrador selecciona el rol. Los administradores tienen acceso completo. Para un operador, elige su ubicación y las acciones permitidas: registrar ventas, entradas o traslados. Si dejas todas las acciones sin marcar, la cuenta puede consultar su ubicación.

Desde cada fila, **Editar** permite cambiar los datos y **Desactivar** revoca el acceso. **Reactivar** habilita nuevamente la cuenta. Cada administrador conserva su propio rol y acceso mientras gestiona otros usuarios.

En **Productos**, el administrador puede editar el nombre y el mínimo de stock. **Ocultar** retira el producto de las vistas operativas y de los formularios de movimientos. Usa el filtro **Ocultos** para editarlo o volverlo a mostrar. Su stock y el historial de movimientos se conservan.

## 5. Desplegar en Vercel

1. Sube esta carpeta a tu repositorio Git y luego importa ese repositorio en Vercel. Si el repositorio contiene varias carpetas, selecciona esta carpeta como **Root Directory**.
2. Selecciona **Other** como framework. El archivo `vercel.json` define la compilación, las rutas de API y la carpeta pública.
3. Configura Node.js **22.x**.
4. Añade `DATABASE_URL` y `APP_URL` en las variables de entorno del proyecto Vercel.
5. `APP_URL` debe ser el origen HTTPS exacto de tu web, por ejemplo `https://mi-inventario.vercel.app`, sin rutas. Si cambias de dominio, actualiza la variable y vuelve a desplegar.
6. Despliega. Si primero necesitas conocer la dirección asignada, realiza el primer despliegue, copia su dominio estable, configura `APP_URL` y vuelve a desplegar.
7. Inicia sesión con el administrador que creaste contra esa misma base de datos.

Configuración esperada:

| Opción | Valor |
|---|---|
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `public` |
| Node.js | `22.x` |

No subas `.env.local`, `node_modules` ni contraseñas a Git. Configura las variables también para Preview si vas a usar ese entorno; cada dominio utilizado requiere su `APP_URL` correspondiente. Para evitar cambios sobre datos reales, utiliza otra base para pruebas.

La instalación de tablas y la creación del administrador son pasos explícitos: no se ejecutan automáticamente en cada despliegue. No existe un botón público para crear el primer administrador.

## Archivos principales

| Archivo / carpeta | Contenido |
|---|---|
| `public/index.html` | Página principal |
| `public/styles.css` | Diseño adaptable |
| `public/app.js` | Pantallas, formularios, filtros y gráficas |
| `api/index.js` | Entrada de la API para Vercel |
| `lib/http.js` | Rutas, validación de solicitudes y sesión |
| `lib/auth.js`, `lib/security.js` | Inicio de sesión, contraseñas y cookies |
| `lib/inventory.js` | Reglas de inventario y permisos |
| `lib/database.js` | Conexión PostgreSQL y transacciones |
| `sql/` | Esquema y datos para reconstruir la base |
| `scripts/` | Preparación de base, administrador y comprobación de archivos |
| `tests/` | Pruebas de integración con PostgreSQL en memoria |
| `seed.json` | Datos originales del Excel usados por la importación |
| `referencias/` | Excel e imagen originales proporcionados |

## Comprobaciones

```powershell
npm test
npm run build
```

Las pruebas ejecutan el SQL y las operaciones en PostgreSQL mediante PGlite: acceso, cierre de sesión, contraseñas, revocación, permisos por ubicación, bloqueo por intentos, totales del Excel, importación única, ventas simultáneas y rechazo de stock insuficiente. Esta entrega no ha sido desplegada en tu cuenta Vercel ni conectada a una base externa tuya.

Haz copias de seguridad con las herramientas de tu proveedor. Un respaldo completo de PostgreSQL conserva también usuarios y contraseñas cifradas; el SQL de esta entrega reproduce los datos originales del Excel y no contiene tus futuras operaciones.

Referencias de configuración: [Funciones Node.js en Vercel](https://vercel.com/docs/functions/runtimes/node-js), [configuración de vercel.json](https://vercel.com/docs/project-configuration/vercel-json), [node-postgres](https://node-postgres.com/features/connecting).
