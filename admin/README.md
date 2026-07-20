# NOX Control — PHP, Apache y MySQL

Aplicación privada de administración para NOX Panamá. Funciona con **PHP 8.2 o superior**, **Apache 2.4** y **MySQL 8.4**. No usa Node.js, npm ni Composer.

## Funciones

- Roles: administrador, supervisor y cajero.
- POS conectado a recetas y existencias.
- Compras, costos promedio, ajustes, mermas y conteos.
- Apertura y cierre de caja con efectivo esperado y diferencias.
- Pagos registrados como efectivo, tarjeta o Yappy.
- Reportes diarios, quincenales y mensuales.
- Marcación y aprobación de horas.
- Planilla quincenal o mensual con horas extra, bonos y deducciones.
- Auditoría de usuarios, ventas, inventario, cajas y planilla.

## Permisos

| Módulo | Administrador | Supervisor | Cajero |
|---|---:|---:|---:|
| POS | Sí | Sí | Propia caja |
| Apertura y cierre | Sí | Sí | Propia caja |
| Inventario y compras | Sí | Sí | No |
| Reportes | Sí | Sí | No |
| Marcación personal | Sí | Sí | Sí |
| Aprobación de horas | Sí | Sí | No |
| Planilla | Sí | No | No |
| Usuarios | Sí | No | No |

Los permisos se comprueban en PHP en cada solicitud. La interfaz por sí sola nunca concede autorización.

## Requisitos del servidor

- Apache 2.4 con `mod_rewrite`.
- PHP 8.2+ con `pdo_mysql` y `mbstring`.
- MySQL 8.0+; recomendado 8.4.
- HTTPS obligatorio para producción.
- Un subdominio, recomendado: `admin.noxpanama.com`.

En Ubuntu o Debian:

```bash
sudo apt update
sudo apt install apache2 mysql-client php php-mysql php-mbstring libapache2-mod-php certbot python3-certbot-apache
sudo a2enmod rewrite ssl headers
```

Si el servidor utiliza PHP-FPM en lugar de `libapache2-mod-php`, configure el manejador FPM correspondiente antes de continuar.

## 1. Crear el subdominio

En el proveedor DNS cree un registro `A`:

```text
Nombre: admin
Destino: IP pública del servidor Apache
```

Espere a que `admin.noxpanama.com` resuelva hacia el servidor.

## 2. Copiar la aplicación

Copie únicamente la carpeta `admin` del repositorio:

```bash
sudo mkdir -p /var/www/nox-admin
sudo cp -R admin/. /var/www/nox-admin/
sudo chown -R root:www-data /var/www/nox-admin
sudo find /var/www/nox-admin -type d -exec chmod 750 {} \;
sudo find /var/www/nox-admin -type f -exec chmod 640 {} \;
```

Apache debe usar como raíz pública exactamente:

```text
/var/www/nox-admin/public
```

Nunca utilice `/var/www/nox-admin` como `DocumentRoot`; de lo contrario podría exponer configuración o archivos SQL.

## 3. Crear MySQL

Entre a MySQL como administrador:

```bash
sudo mysql
```

Cree la base y un usuario exclusivo. Reemplace la contraseña:

```sql
CREATE DATABASE IF NOT EXISTS nox_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'nox_app'@'localhost' IDENTIFIED BY 'UNA_CLAVE_LARGA_Y_UNICA';
GRANT SELECT, INSERT, UPDATE, DELETE ON nox_admin.* TO 'nox_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Importe el esquema con una cuenta que pueda crear tablas:

```bash
sudo mysql nox_admin < /var/www/nox-admin/db/schema.sql
```

El usuario web `nox_app` no necesita permisos para crear o eliminar tablas.

## 4. Configurar secretos

Copie el ejemplo fuera del directorio público:

```bash
sudo cp /var/www/nox-admin/apache/nox-admin-env.conf.example /etc/apache2/nox-admin-env.conf
sudo chown root:www-data /etc/apache2/nox-admin-env.conf
sudo chmod 640 /etc/apache2/nox-admin-env.conf
sudo nano /etc/apache2/nox-admin-env.conf
```

Cambie obligatoriamente `DB_PASSWORD` y las credenciales iniciales. No suba este archivo con las claves reales a GitHub.

## 5. Configurar Apache

Instale el VirtualHost incluido:

```bash
sudo cp /var/www/nox-admin/apache/nox-admin.conf.example /etc/apache2/sites-available/nox-admin.conf
sudo a2ensite nox-admin.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

El resultado de `apache2ctl configtest` debe ser `Syntax OK`.

## 6. Crear el primer administrador

Las variables `SetEnv` de Apache no existen automáticamente en la terminal. Ejecute el script pasando las variables de forma temporal:

```bash
sudo -u www-data env \
  DB_HOST=127.0.0.1 \
  DB_PORT=3306 \
  DB_NAME=nox_admin \
  DB_USER=nox_app \
  DB_PASSWORD='UNA_CLAVE_LARGA_Y_UNICA' \
  INITIAL_ADMIN_EMAIL='admin@noxpanama.com' \
  INITIAL_ADMIN_PASSWORD='UNA_CLAVE_INICIAL_DE_12_CARACTERES' \
  INITIAL_ADMIN_NAME='Administrador NOX' \
  php /var/www/nox-admin/scripts/create-admin.php
```

Después de ingresar, cree cuentas individuales para cada trabajador. No comparta la cuenta del administrador.

## 7. Activar HTTPS

Cuando el DNS ya apunte al servidor:

```bash
sudo certbot --apache -d admin.noxpanama.com
sudo apache2ctl configtest
sudo systemctl reload apache2
```

Compruebe que `https://admin.noxpanama.com/api/health` devuelva:

```json
{"ok":true,"service":"nox-admin-php"}
```

Después abra `https://admin.noxpanama.com` e inicie sesión.

## Actualizaciones futuras

Antes de reemplazar archivos:

1. haga una copia de seguridad de MySQL;
2. copie la versión nueva a una carpeta temporal;
3. compare y aplique cambios de `db/schema.sql`;
4. reemplace `app/` y `public/`;
5. conserve `/etc/apache2/nox-admin-env.conf`;
6. ejecute `apache2ctl configtest` y recargue Apache.

## Seguridad y respaldos

- Mantenga `COOKIE_SECURE=true`.
- No use el usuario `root` de MySQL en la aplicación.
- Restrinja MySQL a `localhost` cuando esté en el mismo servidor.
- Haga respaldos automáticos diarios y pruebe su restauración.
- Proteja `/etc/apache2/nox-admin-env.conf` con permisos `640`.
- Mantenga PHP, Apache y MySQL actualizados.
- Revise periódicamente cierres, usuarios y auditoría.

## Nota sobre planilla

La planilla calcula horas aprobadas, tarifa por hora o salario mensual, horas extra, bonos y deducciones manuales. Las deducciones legales automáticas de Panamá deben validarse con el contador o responsable de planilla antes de emitir pagos oficiales.
