# NOOX Control — despliegue en CentOS/cPanel

Aplicación privada de administración para NOOX Panamá. Funciona con PHP 7.4.32 o superior, Apache 2.4 y MySQL 8.0+. No usa Node.js, npm ni Composer.

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
- también se puede pegar una lista libre, numerada o con viñetas, usando una
  línea por invitado; el panel detecta teléfonos, correos y notas y muestra una
  vista previa antes de crear los QR;
- la importación corrige texto UTF-8 mal interpretado para evitar nombres como
  `SofÃ­a`, conservando correctamente tildes y letras como `ñ`;
- cada evento personal puede dividir sus invitados en varias listas por
  promotor, cortesía, mesa o grupo;
- cada lista puede generar un código privado para `/promotores/`; desde ese
  portal público el promotor agrega una persona o pega hasta 100 nombres y
  recibe enlaces individuales listos para compartir;
- los códigos de promotor se guardan como hash, pueden regenerarse o revocarse
  desde administración y no permiten consultar los datos históricos de la
  lista;
- la tabla admite seleccionar uno, varios o todos los invitados visibles para
  editarlos o eliminarlos, y también permite vaciar o eliminar una lista
  completa junto con sus QR y lecturas;
- cualquier lista o el evento completo se puede descargar en Excel con nombre,
  contacto, notas, estado, token único, contenido QR y enlace público;
- administradores y supervisores crean eventos, invitados y códigos;
- los eventos se pueden editar para corregir nombre, horario, capacidad, notas
  y modalidad antes de que exista actividad;
- un administrador puede eliminar definitivamente un evento escribiendo su
  nombre como confirmación; la operación también borra sus invitados, QR,
  lecturas de acceso y datos de auditoría asociados;
- cualquier usuario activo del panel puede operar el escáner de puerta;
- el botón **Escáner en pantalla completa** abre `/scanner/`, una vista
  exclusiva para el personal de entrada sin el resto de la administración;
- cada lectura conserva hora, resultado y usuario que la realizó;
- cada invitación personal tiene un enlace público con formato
  `https://admin.noxpanama.com/invite/#TOKEN`, que se puede copiar o compartir
  desde la lista de invitados;
- el invitado puede abrir el enlace sin iniciar sesión, escribir su token,
  consultar el estado de la invitación, ver o descargar su QR y agregar el pase
  a Apple Wallet o Google Wallet cuando las credenciales estén habilitadas;
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
**HTTPS**. Tanto para una instalación nueva como para actualizar una base ya
existente, importe únicamente:

```text
/home/noxpana/public_html/admin/db/schema.sql
```

`schema.sql` contiene todas las tablas y actualizaciones estructurales de
eventos, promotores, inventario, POS, usuarios y planilla. Es idempotente y no
contiene datos iniciales: no ejecuta `INSERT`, `UPDATE`, `DELETE` ni elimina
tablas o columnas. En una base existente conserva intactos productos, artículos,
usuarios, ventas, compras, invitados, cuentas y auditorías.

El POS está optimizado para pantallas táctiles. Antes de agregar productos se
debe elegir una cuenta abierta, crear una cuenta con el nombre del cliente o
seleccionar **Venta rápida**. Las cuentas conservan sus productos en MySQL hasta
el cobro y reservan inmediatamente los artículos de sus recetas. El POS descuenta
esas reservas de la disponibilidad de las demás cuentas y ventas rápidas. Al
limpiar una cuenta se liberan; al cobrar se convierten en salida definitiva sin
descontar dos veces. Una venta rápida se cobra sin dejar una cuenta pendiente.

Funciones operativas del POS:

- apertura, cambio y cierre de caja con cálculo del efectivo esperado;
- búsqueda y filtrado por categoría del catálogo disponible;
- venta rápida o cuentas pendientes con reserva inmediata de inventario;
- modificación y eliminación de cantidades, y cancelación completa de una
  cuenta con liberación de sus reservas;
- descuento por venta y cobro con efectivo, tarjeta, Yappy o hasta tres métodos
  combinados, sin permitir métodos duplicados ni diferencias en el total;
- cálculo de efectivo recibido y cambio antes de confirmar el cobro;
- recibo imprimible al completar la venta;
- historial reciente con detalle de total, cajero y métodos de pago;
- anulación de una venta mientras su caja siga abierta, con devolución del
  inventario y trazabilidad del motivo;
- redondeo monetario por línea idéntico en el navegador y el servidor para
  evitar diferencias de centavos;
- auditoría de cambios de cuenta, cobros y anulaciones.

- Acceso mediante nombre de usuario, sin correo obligatorio.
- Usuarios editables, contraseña mínima de 4 caracteres y una caja asignable por usuario.
- Artículos y productos editables o eliminables sin alterar compras, movimientos ni ventas históricas.
- Selección múltiple de artículos y productos para eliminarlos en una sola operación segura.
- Reinicio completo del catálogo de inventario, exclusivo del administrador y protegido por confirmación escrita.
- Inventario conectado a recetas y ventas.
- Precio de venta sugerido según el costo actual de la receta y el margen bruto objetivo.
- Análisis de rentabilidad por producto, merma valorada y planificación de reposición.
- Cierres diarios, reportes quincenales y mensuales.
- Compras, ajustes, mermas, conteos, horas y planilla.
- Existencia física, reservada y disponible diferenciadas en inventario y
  reposición; los conteos, ajustes y mermas nunca pueden consumir unidades ya
  apartadas por una cuenta abierta.

## Modelo de artículos y productos

- **Artículo físico:** lo que se almacena y cuenta. Define su identidad,
  categoría, unidad base, presentación habitual y cuántas unidades base contiene
  cada presentación. No fija el precio de compra.
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

Cada producto puede recibir una fotografía JPG, PNG o WebP de hasta 5 MB. Antes
de enviarla, el navegador la recorta al centro y la convierte a WebP; el
servidor vuelve a normalizarla y la guarda siempre en **768 × 768 px**, WebP y
calidad 82. Este doble control mantiene uniforme el catálogo y evita almacenar
los originales pesados. El servidor requiere PHP GD con soporte WebP. Si no se
carga una imagen, el sistema utiliza automáticamente el recurso liviano
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

Ejemplos de configuración y consumo:

- el artículo **Cerveza** se configura con unidad base `unidad`, presentación
  `Caja de 24` y contenido `24`. Recibir 2 cajas agrega 48 unidades; el producto
  **Cerveza individual** usa cantidad `1` y cada venta descuenta una cerveza;
- el artículo **Vodka** se configura con unidad base `ml`, presentación
  `Botella de 750 ml` y contenido `750`. Recibir una botella agrega 750 ml; un
  producto **Trago de vodka** con cantidad `50` descuenta 50 ml por venta.

Los costos de compra se introducen por caja, paquete o botella en cada
recepción. El sistema los convierte automáticamente a costo por unidad base,
recalcula el costo promedio ponderado y conserva la factura histórica. En la
siguiente compra muestra la última presentación y precio como una
referencia editable; nunca impide registrar condiciones distintas.

### Importación de inventario desde Excel

En **Inventario > Importar Excel** se admite un archivo `.xlsx` o `.xls` de una
sola hoja con el esquema `nox_inventory_import_v1`. El sistema primero lee y
verifica todas las filas sin modificar la base de datos. La vista previa indica
qué SKU creará un artículo, cuál reutilizará uno existente, los totales por
factura y cualquier error o advertencia.

La confirmación solo se habilita cuando no existen errores. Al confirmar, todas
las filas se guardan en una única transacción: se crean los artículos faltantes,
se registran las facturas, se reciben las presentaciones y se recalculan las
existencias y costos promedio. Si una operación falla, no se guarda ninguna
fila. Las facturas recibidas previamente se rechazan para impedir que el mismo
archivo duplique el inventario.

El formulario de compra incluye paquetes y cajas de distintos tamaños,
botellas entre 187 ml y 3 L, barriles de 20 a 50 L, presentaciones por peso y
una opción personalizada. Las unidades de control del artículo incluyen
piezas, botellas, latas, mililitros, litros, onzas líquidas, gramos,
kilogramos, porciones, paquetes, cajas y barriles.

## Catálogo e inventario inicial

El instalador no carga artículos ni productos de ejemplo. El catálogo se crea
exclusivamente desde el panel y las existencias y costos nacen al registrar las
compras reales en **Inventario > Registrar compra**.

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
- `openssl`
- `zip`

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

`schema.sql` crea `noxpana_noxpa` si no existe, la selecciona y prepara el
sistema completo. También sirve para actualizar una instalación existente,
incluidos los campos de margen, tiempo de entrega, cobertura de inventario y
la ruta de fotografía de cada producto.
Puede ejecutarlo más de una vez: conserva todos los registros y crea únicamente
las tablas, columnas, índices y relaciones que falten. No carga catálogos,
productos, usuarios, cajas ni datos de ejemplo.

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
'public_invitation_origin' => 'https://admin.noxpanama.com',
'cookie_secure' => true,
```

La aplicación detecta automáticamente el directorio de la cuenta y busca `/home/noxpana/nox-admin-config.php`. También acepta `admin/config/nox-admin-config.php` como alternativa protegida. Para otra ruta puede definir `NOX_ADMIN_CONFIG` en Apache.

## Portal público y Wallet

El portal queda disponible en:

```text
https://admin.noxpanama.com/invite/
```

El enlace compartido conserva el token después de `#`, para que el navegador no
lo envíe al cargar la página ni lo incluya en el encabezado de referencia. El
portal no expone contacto, notas internas ni identificadores consecutivos.
Utiliza el mismo token personal y el mismo QR que ya valida el escáner.

Esta actualización no requiere ejecutar otro SQL: `event_guests.qr_token` ya es
único y funciona como token público de alta entropía. Cancelar, reemitir,
admitir o eliminar una invitación también invalida automáticamente el enlace
anterior.

El portal y la descarga normal del QR funcionan sin credenciales de Wallet. Los
botones de Apple y Google se muestran únicamente cuando la integración
correspondiente está completamente configurada.

### Apple Wallet

En Apple Developer:

1. cree un **Pass Type ID**;
2. genere el certificado correspondiente;
3. exporte certificado y llave privada juntos a un archivo `.p12`;
4. descargue el certificado intermedio **Apple WWDR** en formato PEM.

Guarde los archivos fuera de `public_html`, por ejemplo:

```text
/home/noxpana/private/apple/nox-wallet-pass.p12
/home/noxpana/private/apple/AppleWWDRCA.pem
```

### Google Wallet

En Google Wallet API:

1. cree o active la cuenta emisora y copie su **Issuer ID**;
2. cree una cuenta de servicio en Google Cloud;
3. autorice esa cuenta de servicio dentro de Google Wallet Business Console;
4. descargue su credencial JSON.

Guarde el JSON fuera de `public_html`, por ejemplo:

```text
/home/noxpana/private/google/wallet-service-account.json
```

Agregue ambos proveedores al archivo privado
`/home/noxpana/nox-admin-config.php`:

```php
'wallet' => [
    'apple' => [
        'pass_type_identifier' => 'pass.com.suempresa.nox',
        'team_identifier' => 'SU_TEAM_ID',
        'pkcs12_path' => '/home/noxpana/private/apple/nox-wallet-pass.p12',
        'pkcs12_password' => 'CLAVE_DEL_P12',
        'wwdr_certificate_path' => '/home/noxpana/private/apple/AppleWWDRCA.pem',
    ],
    'google' => [
        'issuer_id' => 'SU_ISSUER_ID',
        'class_suffix' => 'nox_event_invitation',
        'service_account_json_path' => '/home/noxpana/private/google/wallet-service-account.json',
        'origins' => ['https://admin.noxpanama.com'],
    ],
],
```

Proteja esos archivos:

```bash
chmod 600 /home/noxpana/private/apple/*
chmod 600 /home/noxpana/private/google/*
```

No suba certificados, llaves `.p12`, archivos PEM ni credenciales JSON al
repositorio.

## 5. Primer administrador

`schema.sql` no crea usuarios ni contraseñas. En una actualización se conservan
intactas todas las cuentas existentes. En una instalación completamente nueva,
cree el primer administrador mediante el procedimiento seguro definido para el
servidor antes de habilitar el acceso público; las contraseñas deben almacenarse
siempre con un hash generado por PHP, nunca como texto legible.

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

### Actualización de instalaciones anteriores

No es necesario importar archivos históricos de migración. El instalador único
agrega solo la estructura ausente y nunca rellena, transforma o elimina filas.
Si encuentra datos heredados incompatibles con una relación o índice único,
conserva esos datos y omite únicamente esa restricción para evitar alterar la
información existente.

Haga respaldos diarios de la base y pruebe periódicamente una restauración.

PHP 7.4 se admite para el servidor actual, pero ya no recibe mantenimiento oficial. Actualice a una versión vigente cuando el proveedor lo permita, especialmente porque el panel procesa ventas, inventario y planilla.

## Nota sobre planilla

La planilla calcula horas aprobadas, salario por hora o mensual, horas extra, bonos y deducciones manuales. Las obligaciones legales y deducciones automáticas de Panamá deben ser validadas con el contador antes de emitir pagos oficiales.
