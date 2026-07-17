# NOX — Coming Soon

Landing page estática para **NOX**, diseñada en negro y dorado alrededor del concepto *The Celestial Eclipse*.

## Incluye

- Logo oficial original sin modificaciones, acompañado por halo, órbitas y partículas animadas sin librerías pesadas.
- Órbitas animadas alineadas con las dos “O” entrelazadas del logotipo.
- Enlaces oficiales de Instagram y TikTok: `@NoxPanama`.
- Menú digital disponible directamente en `/Menu/` y `/menu/`, alimentado por el archivo editable `Menu/menu.json`, con selector entre “VIP Premium” y “Clásicos & Cervezas”.
- SEO local para NOX Panamá con metadatos sociales, JSON-LD, `robots.txt`, sitemap XML y rutas canónicas.
- Promoción mensual de cervezas nacionales configurada en `Menu/menu.json`.
- El menú abre por defecto en “Clásicos & Cervezas” y la portada enlaza la ubicación verificada de NOX en Calle 67 Este, Ciudad de Panamá, directamente con Google Maps.
- Mapa integrado en la portada y accesos directos para abrir la ubicación en Google Maps o Waze.
- Diseño responsive para móvil, tablet y escritorio.
- Accesibilidad: navegación por teclado, enlace de salto, contraste y soporte para movimiento reducido.
- SEO, Open Graph, Twitter Card, favicon y URL canónica.
- Logo oficial extraído píxel a píxel en PNG transparente y recursos SVG ligeros.

## Ejecutar localmente

Abre `index.html` en el navegador o sirve la carpeta con cualquier servidor estático.

## Publicar con GitHub Pages

En el repositorio, ve a **Settings → Pages**, selecciona **Deploy from a branch**, elige `main` y la carpeta `/ (root)`. La URL prevista es:

`https://noxpanama.com/`

Activa también **Enforce HTTPS** en **Settings → Pages** y comparte siempre la dirección que comienza con `https://`.

## Personalización

Los colores principales están definidos como variables al comienzo de `styles.css`. El logo transparente mostrado se encuentra en `assets/nox-logo-transparent.png`; la imagen social original está en `assets/nox-logo.png` y el favicon usa el isotipo de las dos “O” entrelazadas en `assets/favicon.svg`.
