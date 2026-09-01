# Instrucciones del proyecto NOOX

## Despliegues a producción

Cuando el usuario diga **"sube a producción"**, **"sube cambios a
producción"** o una frase equivalente, debe tratarse como una autorización
explícita para ejecutar el despliegue de este repositorio.

Procedimiento obligatorio:

1. Revisar `git status --short` y `git diff` para entender los cambios locales.
   Los cambios no tienen que estar confirmados en Git para poder publicarse.
2. Ejecutar `./scripts/deploy-production.sh --dry-run` y revisar la lista exacta
   de archivos que cambiará en el servidor.
3. No publicar si la vista previa incluye secretos, archivos de `outputs/`,
   documentación, pruebas, herramientas de desarrollo u otro archivo fuera de
   `deploy/production-files.txt`.
4. Ejecutar las pruebas relevantes. Para cualquier cambio PHP, como mínimo:
   `find admin/app admin/public -name '*.php' -print0 | xargs -0 -n1 php -l`,
   `php admin/tests/pos_logic_test.php` y
   `php admin/tests/product_image_test.php`.
5. Si las verificaciones pasan, ejecutar
   `./scripts/deploy-production.sh --apply`. La autorización ya fue dada por la
   frase del usuario; no pedir otra confirmación salvo que falte configuración,
   una prueba falle o la vista previa revele un riesgo.
6. Informar qué componentes se publicaron, la URL de salud comprobada y
   cualquier advertencia. Nunca afirmar que el despliegue terminó si el chequeo
   de salud no pasó.

El script usa una lista permitida, conserva `admin/public/uploads/products`,
mantiene la configuración privada fuera del repositorio y crea una copia de los
archivos reemplazados. No sustituirlo por `scp -r`, por una copia de todo el
repositorio ni por `git pull` dentro de `public_html`.
