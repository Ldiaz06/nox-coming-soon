# NOX Control — despliegue en CentOS/cPanel

Aplicación privada de administración para NOX Panamá. Funciona con PHP 7.4.32 o superior, Apache 2.4 y MySQL 8.0+. No usa Node.js, npm ni Composer.

La carpeta pública del sitio principal es:

```text
/home/noxpana/public_html
```

La aplicación administrativa queda en:

```text
/home/noxpana/public_html/admin
```

El subdominio debe publicar **únicamente** esta carpeta:

```text
/home/noxpana/public_html/admin/public
```

Nunca configure `/home/noxpana/public_html/admin` como raíz pública del subdominio.

## Funciones y roles

- Administrador: acceso total, usuarios, inventario, POS, reportes, horas y planilla.
- Supervisor: POS, inventario, cajas, reportes y aprobación de horas.
- Cajero: POS de pantalla completa, su propia caja y marcación personal.

### Eventos y accesos QR

El módulo **Eventos y accesos** funciona dentro del mismo panel privado y no
modifica la portada pública:

- un evento con **QR general** permite usar el mismo código para registrar y
  contar cada entrada;
- un evento con **QR por persona** genera una invitación individual y bloquea
  automáticamente su segundo uso;
- los invitados de un evento personal pueden cargarse en grupo desde Excel
  (`.xlsx`, `.xls` o `.csv`) usando la plantilla descargable del panel;
- administradores y supervisores crean eventos, invitados y códigos;
- los eventos se pueden editar para corregir nombre, horario, capacidad, notas
  y modalidad antes de que exista actividad;
- cualquier usuario activo del panel puede operar el escáner de puerta;
- el botón **Escáner en pantalla completa** abre `/scanner/`, una vista
  exclusiva para el personal de entrada sin el resto de la administración;
- cada lectura conserva hora, resultado y usuario que la realizó;
- los QR se pueden descargar o compartir como PNG;
- el escáner usa la cámara desde Safari en iOS o Chrome en Android, sin instalar
  una aplicación, e incluye lectura desde una foto como alternativa.

La primera hoja del archivo de invitados debe tener estos encabezados:

| Nombre completo | Contacto | Notas |
| --- | --- | --- |
| Obligatorio, 2 a 160 caracteres | Opcional, máximo 160 caracteres | Opcional, máximo 300 caracteres |

Cada fila representa una persona y genera su propio QR. La carga admite hasta
500 invitados por archivo, valida todas las filas antes de importar y se
confirma desde una vista previa.

La cámara del navegador requiere que `admin.noxpanama.com` se abra mediante
**HTTPS**. Si la base de datos ya está creada, importe únicamente:

```text
/home/noxpana/public_html/admin/db/migrate_events_access.sql
```

Este instalador independiente es idempotente y solo crea las tablas `events`,
`event_guests` y `event_access_log`; no modifica ventas, inventario, usuarios,
cajas, planilla ni otros datos existentes. Para una instalación completamente
nueva, `admin/db/schema.sql` ya incluye también estas tres tablas.

El POS está optimizado para pantallas táctiles. Antes de agregar productos se
debe elegir una cuenta abierta, crear una cuenta con el nombre del cliente o
seleccionar **Venta rápida**. Las cuentas conservan sus productos en MySQL hasta
el cobro y reservan inmediatamente los artículos de sus recetas. El POS descuenta
esas reservas de la disponibilidad de las demás cuentas y ventas rápidas. Al
limpiar una cuenta se liberan; al cobrar se convierten en salida definitiva sin
descontar dos veces. Una venta rápida se cobra sin dejar una cuenta pendiente.
- Acceso mediante nombre de usuario, sin correo obligatorio.
- Usuarios editables, contraseña mínima de 4 caracteres y una caja asignable por usuario.
- Artículos y productos editables sin alterar compras, movimientos ni ventas históricas.
- Inventario conectado a recetas y ventas.
- Precio de venta sugerido según el costo actual de la receta y el margen bruto objetivo.
- Análisis de rentabilidad por producto, merma valorada y planificación de reposición.
- Cierres diarios, reportes quincenales y mensuales.
- Compras, ajustes, mermas, conteos, horas y planilla.

## Modelo de artículos y productos

- **Artículo físico:** lo que se almacena y cuenta. Define su identidad,
  categoría y unidad base de inventario, pero no fija presentación ni precio
  de compra.
- **Compra:** registra la presentación recibida, su contenido, cantidad entera
  y precio real por cada factura. Conserva el historial aunque esos datos
  cambien entre compras.
- **Producto de venta:** lo que aparece en el POS. Su composición indica qué
  artículos y cantidades se descuentan por cada unidad vendida.

La administración mantiene estos flujos en menús independientes:

- **Artículos:** creación del catálogo físico y sus unidades de control;
- **Productos:** creación y edición del catálogo del POS, recetas, costos, estados y márgenes;
- **Inventario:** compras, presentaciones, precios, existencias,
  conteos, ajustes y mermas.

Los formularios de artículos y productos incluyen catálogos amplios de
categorías para bares y discotecas. Si una categoría no existe, seleccione
`+ Agregar nueva categoría` y escríbala; después de guardar el registro, esa
categoría queda disponible automáticamente para los siguientes registros.

Cada producto puede llevar una fotografía JPG, PNG o WebP de hasta 5 MB. Si no
se carga una imagen, el sistema utiliza automáticamente el recurso liviano
`/assets/product-default-v3.webp`, con un único objeto abstracto y neutral
sobre una barra nocturna, sin asociarlo con bebidas, alimentos ni otra
categoría particular. La imagen se muestra en el catálogo administrativo y en
las tarjetas del POS. Un administrador o supervisor puede reemplazarla desde **Productos >
Agregar foto** o **Cambiar foto**. Los archivos personalizados se guardan en:

```text
/home/noxpana/public_html/admin/public/uploads/products
```

La carpeta incluye protección contra ejecución de scripts. Si Apache no puede
guardar una imagen, confirme que el directorio pertenezca al usuario de la
cuenta:

```bash
chown -R noxpana:noxpana /home/noxpana/public_html/admin/public/uploads
find /home/noxpana/public_html/admin/public/uploads -type d -exec chmod 755 {} \;
find /home/noxpana/public_html/admin/public/uploads -type f -exec chmod 644 {} \;
```

Ejemplos al registrar una compra:

- una caja de 24 cervezas se recibe como presentación `Caja de 24`, contenido
  `24` y unidad base `unidad`; recibir 2 cajas agrega 48 unidades;
- una botella de licor de 750 ml se recibe como presentación
  `Botella de 750 ml`, contenido `750` y unidad base `ml`; un producto que use
  50 ml descuenta exactamente esa cantidad en cada venta.

Los costos de compra se introducen por caja, paquete o botella en cada
recepción. El sistema los convierte automáticamente a costo por unidad base,
recalcula el costo promedio ponderado y conserva la factura histórica. En la
siguiente compra muestra la última presentación y precio como una
referencia editable; nunca impide registrar condiciones distintas.

El formulario de compra incluye paquetes y cajas de distintos tamaños,
botellas entre 187 ml y 3 L, barriles de 20 a 50 L, presentaciones por peso y
una opción personalizada. Las unidades de control del artículo incluyen
piezas, botellas, latas, mililitros, litros, onzas líquidas, gramos,
kilogramos, porciones, paquetes, cajas y barriles.

## Catálogo base para el mercado panameño

El archivo independiente:

```text
/home/noxpana/public_html/admin/db/seed_panama_inventory.sql
```

agrega **222 artículos distribuidos en 45 categorías**, incluyendo cervezas
nacionales, importadas y artesanales, ron y seco panameño, whisky, vodka,
ginebra, tequila, mezcal, vinos, champagne, mezcladores, frutas, insumos de
barra, alimentos, limpieza y cristalería.

El catálogo base no inventa presentaciones ni costos. Todos comienzan sin
existencias y con `Unidad base` como valor técnico de compatibilidad; la
presentación y el precio válidos nacen al registrar la primera compra.

Ejecútelo solamente después de `schema.sql`, desde phpMyAdmin o Terminal:

```bash
mysql -u noxpana_nox_app -p noxpana_noxpa \
  < /home/noxpana/public_html/admin/db/seed_panama_inventory.sql
```

El catálogo es idempotente: puede ejecutarse más de una vez y no duplica ni
reemplaza la identidad de un SKU existente. Solo normaliza a `Unidad base` los
artículos `PA-` que continúan en cero y no tienen compras ni movimientos; nunca
modifica registros con historial operativo. Todos los artículos nuevos
empiezan con existencia, mínimo y costo en cero. Esto evita registrar precios o
cantidades que no correspondan a las facturas reales.
Después de importarlo, registre la primera compra desde **Inventario >
Registrar compra**.

## Costos, rentabilidad y reposición

Al crear un producto de venta, el sistema suma el costo promedio vigente de
todos sus ingredientes. El precio sugerido se calcula como:

```text
precio sugerido = costo de la receta / (1 - margen bruto objetivo)
```

El resultado se redondea hacia arriba al siguiente múltiplo de 0.25. El margen
predeterminado es 70 % y puede modificarse por producto. Es un margen **bruto**:
no descuenta salarios, alquiler, comisiones, impuestos ni otros gastos
operativos.

La sección **Costos y reposición** muestra:

- costo actual, precio sugerido, ganancia unitaria y margen de cada producto;
- venta, costo y ganancia realmente registrados durante el período elegido;
- cantidad y costo de las mermas registradas;
- consumo diario promedio de cada artículo;
- fecha y cantidad sugerida para la próxima compra.

La compra sugerida considera el consumo proveniente de ventas, las anulaciones,
el stock actual, el stock mínimo, el tiempo de entrega, los días de seguridad y
la cobertura objetivo. La cantidad se redondea a presentaciones completas
usando como referencia la última compra recibida (cajas, six-packs o botellas);
ese valor se puede cambiar en la próxima recepción. Los artículos sin historial
de consumo se identifican como `Sin rotación`; requieren criterio operativo
hasta acumular suficientes movimientos.

## 1. Comprobar PHP

En **cPanel > MultiPHP Manager**, confirme que `admin.noxpanama.com` use PHP 7.4.32 o una versión posterior.

En **cPanel > Select PHP Version** o desde WHM, confirme que estén activos:

- `pdo`
- `pdo_mysql`
- `mbstring`
- `session`
- `json`

Si dispone de Terminal o SSH:

```bash
php -v
php -m | grep -E 'PDO|pdo_mysql|mbstring|session|json'
```

## 2. Crear el subdominio administrativo

En **cPanel > Domains**, cree el subdominio. Si la interfaz solicita una ruta relativa al directorio de la cuenta, escriba `public_html/admin/public`; el resultado final debe ser:

```text
Dominio: admin.noxpanama.com
Document Root: /home/noxpana/public_html/admin/public
```

Si el DNS se administra fuera de cPanel, cree también un registro `A` para `admin` apuntando a la IP del servidor.

No es necesario editar manualmente el VirtualHost cuando cPanel administra Apache. El archivo `apache/nox-admin.conf.example` se incluye solo para servidores CentOS administrados directamente como `root`.

## 3. Crear la base MySQL en cPanel

En **cPanel > MySQL Databases**, confirme que estén creados y asociados:

1. base de datos `noxpana_noxpa`;
2. usuario MySQL `noxpana_nox_app`;
3. usuario agregado a la base con **ALL PRIVILEGES**.

cPanel suele agregar el prefijo de la cuenta. Los nombres finales pueden ser:

```text
Base: noxpana_noxpa
Usuario: noxpana_nox_app
```

Use siempre los nombres finales que muestre cPanel. En servidores administrados
directamente, el instalador también puede crear automáticamente la base cuando
se ejecuta con una cuenta MySQL que tenga permiso `CREATE DATABASE`.

En **phpMyAdmin**, importe el único instalador:

```text
/home/noxpana/public_html/admin/db/schema.sql
```

Para cargar el catálogo inicial de seis cervezas con fotografía, precio y
descuento automático de inventario, importe después:

```text
/home/noxpana/public_html/admin/db/seed_beer_products.sql
```

El archivo se puede ejecutar más de una vez. Crea únicamente los artículos
físicos que falten y actualiza los seis productos del POS sin duplicarlos.

`schema.sql` crea `noxpana_noxpa` si no existe, la selecciona y prepara el
sistema completo. También sirve para actualizar una instalación existente,
incluidos los campos de margen, tiempo de entrega, cobertura de inventario y
la ruta de fotografía de cada producto.
Puede ejecutarlo más de una vez: conserva los registros, crea las tablas e
índices que falten y aplica solamente las adaptaciones pendientes de usuarios,
planilla y cajas.

Para crear la base desde cero mediante Terminal, use una cuenta MySQL con
permiso para crear bases:

```bash
mysql -u root -p < /home/noxpana/public_html/admin/db/schema.sql
```

Si cPanel ya creó y asignó la base, puede ejecutarlo con su usuario normal:

```bash
mysql -u noxpana_nox_app -p < /home/noxpana/public_html/admin/db/schema.sql
```

## 4. Crear la configuración privada

La contraseña de MySQL debe quedar fuera de `public_html`:

```bash
cp /home/noxpana/public_html/admin/config/nox-admin-config.php.example /home/noxpana/nox-admin-config.php
chmod 600 /home/noxpana/nox-admin-config.php
nano /home/noxpana/nox-admin-config.php
```

Edite estos valores con los nombres exactos de cPanel:

```php
'db' => [
    'host' => '127.0.0.1',
    'port' => 3306,
    'name' => 'noxpana_noxpa',
    'user' => 'noxpana_nox_app',
    'password' => 'SU_CONTRASENA_MYSQL',
],
```

Mantenga:

```php
'app_origin' => 'https://admin.noxpanama.com',
'cookie_secure' => true,
```

La aplicación detecta automáticamente el directorio de la cuenta y busca `/home/noxpana/nox-admin-config.php`. También acepta `admin/config/nox-admin-config.php` como alternativa protegida. Para otra ruta puede definir `NOX_ADMIN_CONFIG` en Apache.

## 5. Primer administrador

Si la tabla de usuarios está vacía, `schema.sql` crea automáticamente:

```text
Usuario: admin
Contraseña inicial: Nox12345
```

Cambie esa contraseña inmediatamente después del primer inicio de sesión.
Si ya existe al menos un usuario, el instalador no crea ni modifica ninguna
cuenta o contraseña.
La contraseña se almacena en MySQL mediante un hash seguro, nunca como texto
legible.

## 6. Permisos

En un alojamiento cPanel estándar:

```bash
find /home/noxpana/public_html/admin -type d -exec chmod 755 {} \;
find /home/noxpana/public_html/admin -type f -exec chmod 644 {} \;
chmod 600 /home/noxpana/nox-admin-config.php
```

No cambie el propietario de los archivos a `apache`; deben permanecer bajo el usuario `noxpa` en cPanel. Los `.htaccess` incluidos bloquean el acceso web a `app`, `config`, `db`, `scripts` y `apache`.

## 7. HTTPS

En **cPanel > SSL/TLS Status**, ejecute AutoSSL para `admin.noxpanama.com`. No inicie sesión hasta que el certificado esté activo.

Pruebe:

```text
https://admin.noxpanama.com/api/health
```

La respuesta esperada es:

```json
{"ok":true,"service":"nox-admin-php"}
```

Después abra `https://admin.noxpanama.com` e inicie sesión.

## 8. Verificación y diagnóstico

Compruebe la sintaxis PHP desde Terminal:

```bash
find /home/noxpana/public_html/admin -name '*.php' -exec php -l {} \;
```

Si `/api/health` devuelve 404, revise que:

- el Document Root sea exactamente `/home/noxpana/public_html/admin/public`;
- exista `public/api/health/index.php` en la versión desplegada;
- se haya ejecutado `git pull --ff-only origin main` en `public_html`.

La interfaz usa `index.php?api_path=...` como entrada compatible con alojamientos que deshabilitan `mod_rewrite`. El `.htaccess` conserva las rutas limpias cuando Apache permite `AllowOverride`, pero ya no es necesario para operar el panel.

Si devuelve 503, el campo `diagnostic.code` identifica la causa sin exponer
credenciales. Revise **cPanel > Metrics > Errors** y confirme:

- que el subdominio use PHP 7.4.32 o superior;
- que `/home/noxpana/nox-admin-config.php` o `admin/config/nox-admin-config.php` exista y tenga valores reales;
- que `pdo_mysql` esté activo;
- que el usuario MySQL esté asociado a la base;
- que los nombres de base y usuario incluyan el prefijo real de cPanel.

Los códigos más habituales son `DATABASE_AUTH_FAILED` para usuario o contraseña
incorrectos, `DATABASE_ACCESS_DENIED` para permisos faltantes,
`DATABASE_NOT_FOUND` para una base inexistente y `PDO_MYSQL_MISSING` cuando falta
la extensión de PHP. Se recomienda `127.0.0.1` como host para evitar diferencias
entre el socket local configurado en PHP y el utilizado por MySQL.

## Servidor CentOS sin cPanel

Si administra Apache directamente como `root`, instale los módulos y use el VirtualHost incluido:

```bash
sudo dnf install httpd php php-pdo php-mysqlnd php-mbstring
sudo cp /home/noxpana/public_html/admin/apache/nox-admin.conf.example /etc/httpd/conf.d/nox-admin.conf
sudo apachectl configtest
sudo systemctl reload httpd
```

Configure HTTPS con el método de certificados de su servidor. En cPanel no ejecute estos comandos ni edite `/etc/httpd` manualmente.

## Actualizaciones y respaldos

Antes de actualizar:

1. exporte la base desde phpMyAdmin o el sistema de respaldos de cPanel;
2. conserve `/home/noxpana/nox-admin-config.php` fuera de `public_html`;
3. reemplace los archivos de `admin/`;
4. vuelva a importar `admin/db/schema.sql`;
5. pruebe `/api/health`, inicio de sesión, una venta y un cierre de caja.

### Actualización automática de instalaciones anteriores

El instalador único también:

- convierte el correo existente en nombre de usuario sin borrar la cuenta ni cambiar su contraseña;
- convierte empleados mensuales a modalidad quincenal conservando o calculando su tarifa por hora;
- crea una caja individual para cada usuario activo existente.

No es necesario importar por separado los archivos históricos de
Después de actualizar una instalación antigua, el usuario anterior sigue siendo
el mismo texto que se utilizaba como correo. Inicie sesión con ese valor y use
**Usuarios > Editar** para cambiarlo, por ejemplo, a `admin`.

Haga respaldos diarios de la base y pruebe periódicamente una restauración.

PHP 7.4 se admite para el servidor actual, pero ya no recibe mantenimiento oficial. Actualice a una versión vigente cuando el proveedor lo permita, especialmente porque el panel procesa ventas, inventario y planilla.

## Nota sobre planilla

La planilla calcula horas aprobadas, salario por hora o mensual, horas extra, bonos y deducciones manuales. Las obligaciones legales y deducciones automáticas de Panamá deben ser validadas con el contador antes de emitir pagos oficiales.
