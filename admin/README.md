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
- Cajero: POS, su propia caja y marcación personal.
- Inventario conectado a recetas y ventas.
- Cierres diarios, reportes quincenales y mensuales.
- Compras, ajustes, mermas, conteos, horas y planilla.

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
2. usuario MySQL `noxpana_noxpa`;
3. usuario agregado a la base con **ALL PRIVILEGES**.

cPanel suele agregar el prefijo de la cuenta. Los nombres finales pueden ser:

```text
Base: noxpana_noxpa
Usuario: noxpana_noxpa
```

Use siempre los nombres finales que muestre cPanel.

En **phpMyAdmin** seleccione esa base e importe:

```text
/home/noxpana/public_html/admin/db/schema.sql
```

El esquema crea únicamente las tablas dentro de la base seleccionada; no intenta crear otra base ni cambiarla.

También puede importarlo desde Terminal, reemplazando el usuario si cPanel asignó otro nombre:

```bash
mysql -u noxpana_noxpa -p noxpana_noxpa < /home/noxpana/public_html/admin/db/schema.sql
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
    'host' => 'localhost',
    'port' => 3306,
    'name' => 'noxpana_noxpa',
    'user' => 'noxpana_noxpa',
    'password' => 'SU_CONTRASENA_MYSQL',
],
```

Mantenga:

```php
'app_origin' => 'https://admin.noxpanama.com',
'cookie_secure' => true,
```

La aplicación detecta automáticamente el directorio de la cuenta y busca `/home/noxpana/nox-admin-config.php`. También acepta `admin/config/nox-admin-config.php` como alternativa protegida. Para otra ruta puede definir `NOX_ADMIN_CONFIG` en Apache.

## 5. Crear el primer administrador

En `/home/noxpana/nox-admin-config.php`, coloque temporalmente un correo y una contraseña inicial de al menos 12 caracteres:

```php
'initial_admin' => [
    'email' => 'admin@noxpanama.com',
    'password' => 'UNA_CLAVE_INICIAL_LARGA',
    'name' => 'Administrador NOX',
],
```

Luego ejecute:

```bash
php /home/noxpana/public_html/admin/scripts/create-admin.php
```

Debe aparecer:

```text
Administrador creado o actualizado: admin@noxpanama.com
```

Después borre la contraseña inicial del archivo, dejándola vacía:

```php
'password' => '',
```

La contraseña del usuario ya quedó almacenada en MySQL mediante un hash seguro.

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

Si devuelve 500, revise **cPanel > Metrics > Errors** y confirme:

- que el subdominio use PHP 7.4.32 o superior;
- que `/home/noxpana/nox-admin-config.php` o `admin/config/nox-admin-config.php` exista y tenga valores reales;
- que `pdo_mysql` esté activo;
- que el usuario MySQL esté asociado a la base;
- que los nombres de base y usuario incluyan el prefijo real de cPanel.

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
4. aplique solo las migraciones SQL nuevas que correspondan;
5. pruebe `/api/health`, inicio de sesión, una venta y un cierre de caja.

Haga respaldos diarios de la base y pruebe periódicamente una restauración.

PHP 7.4 se admite para el servidor actual, pero ya no recibe mantenimiento oficial. Actualice a una versión vigente cuando el proveedor lo permita, especialmente porque el panel procesa ventas, inventario y planilla.

## Nota sobre planilla

La planilla calcula horas aprobadas, salario por hora o mensual, horas extra, bonos y deducciones manuales. Las obligaciones legales y deducciones automáticas de Panamá deben ser validadas con el contador antes de emitir pagos oficiales.
