# NOX Control

Aplicación privada de administración para NOX Panamá. Incluye autenticación, permisos por rol, inventario, POS, cierres de caja, reportes, asistencia y planilla sobre MySQL 8.4.

## Roles

| Módulo | Administrador | Supervisor | Cajero |
|---|---:|---:|---:|
| POS y ventas | Sí | Sí | Sí, en su propia caja |
| Apertura y cierre | Sí | Sí | Sí, en su propia caja |
| Inventario, recetas y compras | Sí | Sí | No |
| Reportes | Sí | Sí | No |
| Marcación de entrada y salida | Sí | Sí | Sí |
| Aprobación de horas | Sí | Sí | No |
| Planilla | Sí | No | No |
| Usuarios y roles | Sí | No | No |

Los permisos se validan en el servidor; ocultar una opción en la interfaz no concede ni retira autorización.

## Flujo del POS e inventario

Cada producto del POS tiene una receta compuesta por uno o más artículos de inventario. Al completar una venta, el servidor:

1. bloquea la caja, productos y existencias involucradas;
2. recalcula precios, impuestos y total en el servidor;
3. verifica el pago y la disponibilidad;
4. registra venta, líneas y pagos;
5. descuenta todos los componentes de inventario;
6. escribe el movimiento y la auditoría;
7. confirma todo en una sola transacción MySQL.

Si cualquier operación falla, la transacción completa se revierte.

## Puesta en marcha local

Requisitos: Node.js 20 o superior y MySQL 8.4.

1. Copia `.env.example` como `.env` y reemplaza todas las claves.
2. Ejecuta `db/schema.sql` en la base de datos MySQL.
3. Instala las dependencias con `pnpm install` o `npm install`.
4. Crea la cuenta inicial con `pnpm seed:admin`.
5. Inicia la aplicación con `pnpm start`.

Para desarrollo también se incluye `docker-compose.yml`, que inicia MySQL y la aplicación. Antes de usarlo fuera de una computadora local deben reemplazarse todas las claves incluidas como ejemplo.

## Variables importantes

- `APP_ORIGIN`: dirección exacta del panel, por ejemplo `https://admin.noxpanama.com`.
- `JWT_SECRET`: secreto aleatorio de al menos 48 caracteres.
- `COOKIE_SECURE`: debe ser `true` en producción.
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`: conexión MySQL.

El usuario MySQL de producción debe limitarse a esta base de datos. No se debe usar `root`.

## Planilla

El cálculo usa horas aprobadas, tarifa por hora o salario mensual, multiplicador de horas extra, bonos y deducciones manuales. Los topes iniciales son configurables en el código: 80 horas por quincena y 160 por mes.

Esta primera versión no aplica automáticamente deducciones legales de Panamá. Esas reglas deben configurarse y validarse con el contador o responsable de planilla antes de emitir pagos oficiales.

## Publicación

La aplicación requiere un servicio compatible con Node.js y acceso privado a MySQL. La recomendación es publicarla como `admin.noxpanama.com`, detrás de HTTPS, sin enlazarla desde la portada pública. GitHub Pages solamente puede seguir alojando la landing y el menú; no puede ejecutar esta aplicación administrativa.

Antes de producción:

- usar MySQL administrado con copias de seguridad automáticas;
- activar HTTPS y `COOKIE_SECURE=true`;
- crear secretos únicos;
- restringir la base de datos por red;
- comprobar restauración de respaldos;
- crear cuentas individuales, nunca compartidas;
- revisar usuarios, auditoría y cierres periódicamente.
