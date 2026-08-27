-- NOOX Control — catálogo base de artículos para Panamá
-- Ejecutar después de schema.sql.
-- Es idempotente: INSERT IGNORE conserva cualquier SKU que ya exista.
-- Existencias, mínimos y costos empiezan en cero para no inventar datos.
-- El catálogo solo define la unidad de control. Presentación, conversión y
-- precio real se registran desde Compras al recibir mercancía.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
USE noxpana_noxpa;

START TRANSACTION;

INSERT IGNORE INTO inventory_items
  (sku, name, category, unit, package_name, units_per_package,
   lead_time_days, safety_stock_days, target_stock_days,
   current_stock, minimum_stock, average_cost, active)
VALUES
  -- Cervezas nacionales de alta rotación
  ('PA-BEER-BALBOA-355', 'Balboa 355 ml', 'Cervezas nacionales', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-BEER-BALBOA-DORADA-355', 'Balboa Dorada 355 ml', 'Cervezas nacionales', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-BEER-BALBOA-ICE-355', 'Balboa Ice 355 ml', 'Cervezas nacionales', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-BEER-ATLAS-GOLDEN-355', 'Atlas Golden Light 355 ml', 'Cervezas nacionales', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-BEER-ATLAS-355', 'Atlas Lager 355 ml', 'Cervezas nacionales', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-BEER-PANAMA-355', 'Panamá Lager 355 ml', 'Cervezas nacionales', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-BEER-PANAMA-LIGHT-355', 'Panamá Light 355 ml', 'Cervezas nacionales', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-BEER-PANAMA-LIVIANA-355', 'Panamá Liviana 355 ml', 'Cervezas nacionales', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-BEER-SOBERANA-355', 'Soberana 355 ml', 'Cervezas nacionales', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-BEER-CRISTAL-355', 'Cristal 355 ml', 'Cervezas nacionales', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-BEER-OLDTOWN-507-355', 'Old Town 507 Lager 355 ml', 'Cervezas nacionales', 'unit', 'Unidad base', 1, 4, 2, 14, 0, 0, 0, TRUE),

  -- Cervezas importadas y sin alcohol
  ('PA-BEER-CORONA-355', 'Corona Extra 355 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 4, 3, 18, 0, 0, 0, TRUE),
  ('PA-BEER-HEINEKEN-330', 'Heineken Original 330 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 4, 3, 18, 0, 0, 0, TRUE),
  ('PA-BEER-HEINEKEN-SILVER-330', 'Heineken Silver 330 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 4, 3, 18, 0, 0, 0, TRUE),
  ('PA-BEER-STELLA-330', 'Stella Artois 330 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 5, 3, 18, 0, 0, 0, TRUE),
  ('PA-BEER-BUDWEISER-355', 'Budweiser 355 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 4, 3, 18, 0, 0, 0, TRUE),
  ('PA-BEER-BUDLIGHT-355', 'Bud Light 355 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 4, 3, 18, 0, 0, 0, TRUE),
  ('PA-BEER-MILLER-LITE-355', 'Miller Lite 355 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 4, 3, 18, 0, 0, 0, TRUE),
  ('PA-BEER-COORS-LIGHT-355', 'Coors Light 355 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 4, 3, 18, 0, 0, 0, TRUE),
  ('PA-BEER-MODELO-355', 'Modelo Especial 355 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 5, 3, 18, 0, 0, 0, TRUE),
  ('PA-BEER-NEGRA-MODELO-355', 'Negra Modelo 355 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 5, 3, 18, 0, 0, 0, TRUE),
  ('PA-BEER-DOS-EQUIS-355', 'Dos Equis Lager 355 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 5, 3, 18, 0, 0, 0, TRUE),
  ('PA-BEER-BLUE-MOON-355', 'Blue Moon 355 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 5, 3, 18, 0, 0, 0, TRUE),
  ('PA-BEER-GUINNESS-355', 'Guinness Draught 355 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 6, 4, 21, 0, 0, 0, TRUE),
  ('PA-BEER-PERONI-330', 'Peroni Nastro Azzurro 330 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 6, 4, 21, 0, 0, 0, TRUE),
  ('PA-BEER-ESTRELLA-DAMM-330', 'Estrella Damm 330 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 6, 4, 21, 0, 0, 0, TRUE),
  ('PA-BEER-AMSTEL-ULTRA-296', 'Amstel Ultra 296 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 5, 3, 18, 0, 0, 0, TRUE),
  ('PA-BEER-BAVARIA-330', 'Bavaria Premium 330 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 5, 3, 18, 0, 0, 0, TRUE),
  ('PA-BEER-HEINEKEN-00-330', 'Heineken 0.0 330 ml', 'Cervezas sin alcohol', 'unit', 'Unidad base', 1, 5, 3, 18, 0, 0, 0, TRUE),
  ('PA-BEER-CLANDESTINA-00-355', 'Clandestina Sin Alcohol 355 ml', 'Cervezas sin alcohol', 'unit', 'Unidad base', 1, 5, 3, 18, 0, 0, 0, TRUE),

  -- Cervezas artesanales panameñas
  ('PA-CRAFT-CASABRUJA-CHIVOPERRO', 'Casa Bruja Chivoperro IPA 355 ml', 'Cervezas artesanales', 'unit', 'Unidad base', 1, 6, 4, 21, 0, 0, 0, TRUE),
  ('PA-CRAFT-CASABRUJA-FULA', 'Casa Bruja Fula 355 ml', 'Cervezas artesanales', 'unit', 'Unidad base', 1, 6, 4, 21, 0, 0, 0, TRUE),
  ('PA-CRAFT-CASABRUJA-TRES-TIGRES', 'Casa Bruja Tres Tristes Tigres 355 ml', 'Cervezas artesanales', 'unit', 'Unidad base', 1, 6, 4, 21, 0, 0, 0, TRUE),
  ('PA-CRAFT-RANADORADA-IPA', 'La Rana Dorada IPA 355 ml', 'Cervezas artesanales', 'unit', 'Unidad base', 1, 6, 4, 21, 0, 0, 0, TRUE),
  ('PA-CRAFT-RANADORADA-PALE', 'La Rana Dorada Pale Ale 355 ml', 'Cervezas artesanales', 'unit', 'Unidad base', 1, 6, 4, 21, 0, 0, 0, TRUE),
  ('PA-CRAFT-CLANDESTINA-XMADRE', 'Clandestina X La Madre 355 ml', 'Cervezas artesanales', 'unit', 'Unidad base', 1, 6, 4, 21, 0, 0, 0, TRUE),
  ('PA-CRAFT-CLANDESTINA-VERANERA', 'Clandestina Veranera Belgian White 355 ml', 'Cervezas artesanales', 'unit', 'Unidad base', 1, 6, 4, 21, 0, 0, 0, TRUE),
  ('PA-CRAFT-LAMURGA-INDIA', 'La Murga India Dormida IPA 355 ml', 'Cervezas artesanales', 'unit', 'Unidad base', 1, 6, 4, 21, 0, 0, 0, TRUE),
  ('PA-CRAFT-LAMURGA-GUACHIMAN', 'La Murga Guachimán 355 ml', 'Cervezas artesanales', 'unit', 'Unidad base', 1, 6, 4, 21, 0, 0, 0, TRUE),
  ('PA-CRAFT-BOCAS-SHANDY', 'Bocas Shandy Jengibre 355 ml', 'Cervezas artesanales', 'unit', 'Unidad base', 1, 6, 4, 21, 0, 0, 0, TRUE),

  -- Ron, seco y aguardiente
  ('PA-RUM-ABUELO-750', 'Ron Abuelo Añejo 750 ml', 'Ron', 'ml', 'Unidad base', 1, 4, 3, 21, 0, 0, 0, TRUE),
  ('PA-RUM-ABUELO-1750', 'Ron Abuelo Añejo 1.75 L', 'Ron', 'ml', 'Unidad base', 1, 4, 3, 21, 0, 0, 0, TRUE),
  ('PA-RUM-ABUELO-7-750', 'Ron Abuelo 7 Años 750 ml', 'Ron', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-RUM-ABUELO-12-750', 'Ron Abuelo 12 Años 750 ml', 'Ron', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-RUM-ABUELO-TWOOAKS-750', 'Ron Abuelo Two Oaks 750 ml', 'Ron', 'ml', 'Unidad base', 1, 7, 5, 30, 0, 0, 0, TRUE),
  ('PA-RUM-ABUELO-CENTURIA-750', 'Ron Abuelo Centuria 750 ml', 'Ron', 'ml', 'Unidad base', 1, 10, 7, 45, 0, 0, 0, TRUE),
  ('PA-RUM-CARTAVIEJA-ANEJO-750', 'Carta Vieja Añejo 750 ml', 'Ron', 'ml', 'Unidad base', 1, 4, 3, 21, 0, 0, 0, TRUE),
  ('PA-RUM-CARTAVIEJA-CLARO-750', 'Carta Vieja Claro 750 ml', 'Ron', 'ml', 'Unidad base', 1, 4, 3, 21, 0, 0, 0, TRUE),
  ('PA-RUM-CARTAVIEJA-EXTRA-750', 'Carta Vieja Extra Claro 750 ml', 'Ron', 'ml', 'Unidad base', 1, 4, 3, 21, 0, 0, 0, TRUE),
  ('PA-RUM-DONPANCHO-8-750', 'Ron Don Pancho 8 Años 750 ml', 'Ron', 'ml', 'Unidad base', 1, 7, 4, 30, 0, 0, 0, TRUE),
  ('PA-RUM-BACARDI-BLANCO-750', 'Bacardí Carta Blanca 750 ml', 'Ron', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-RUM-BACARDI-GOLD-700', 'Bacardí Oro 700 ml', 'Ron', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-RUM-CAPTAIN-MORGAN-750', 'Captain Morgan Spiced 750 ml', 'Ron', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-RUM-FLORCANA-7-750', 'Flor de Caña 7 Años 750 ml', 'Ron', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-RUM-ZACAPA-23-750', 'Zacapa 23 750 ml', 'Ron', 'ml', 'Unidad base', 1, 8, 5, 30, 0, 0, 0, TRUE),
  ('PA-SECO-HERRERANO-750', 'Seco Herrerano 750 ml', 'Aguardiente y seco', 'ml', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-SECO-HERRERANO-1750', 'Seco Herrerano 1.75 L', 'Aguardiente y seco', 'ml', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-SECO-ORO-CANA-750', 'Seco Oro de Caña 750 ml', 'Aguardiente y seco', 'ml', 'Unidad base', 1, 4, 2, 18, 0, 0, 0, TRUE),
  ('PA-AGUARD-ANTIOQUENO-750', 'Aguardiente Antioqueño 750 ml', 'Aguardiente y seco', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-AGUARD-ANTIOQUENO-SA-750', 'Aguardiente Antioqueño Sin Azúcar 750 ml', 'Aguardiente y seco', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),

  -- Whisky y whiskey
  ('PA-WHISKY-JW-RED-750', 'Johnnie Walker Red Label 750 ml', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-WHISKY-JW-BLACK-750', 'Johnnie Walker Black Label 750 ml', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-WHISKY-JW-BLACK-1750', 'Johnnie Walker Black Label 1.75 L', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-WHISKY-JW-GOLD-750', 'Johnnie Walker Gold Label Reserve 750 ml', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 7, 5, 30, 0, 0, 0, TRUE),
  ('PA-WHISKY-OLDPARR-750', 'Old Parr 12 Años 750 ml', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-WHISKY-BUCHANANS-12-750', 'Buchanan''s 12 Años 750 ml', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-WHISKY-BUCHANANS-MASTER-750', 'Buchanan''s Master 750 ml', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 7, 4, 30, 0, 0, 0, TRUE),
  ('PA-WHISKY-CHIVAS-12-750', 'Chivas Regal 12 Años 750 ml', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-WHISKY-CHIVAS-18-750', 'Chivas Regal 18 Años 750 ml', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 8, 5, 30, 0, 0, 0, TRUE),
  ('PA-WHISKY-DEWARS-WHITE-750', 'Dewar''s White Label 750 ml', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-WHISKY-DEWARS-12-750', 'Dewar''s 12 Años 750 ml', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-WHISKY-BLACKWHITE-750', 'Black & White Scotch 750 ml', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-WHISKY-JB-750', 'J&B Rare 750 ml', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-WHISKEY-JACK-750', 'Jack Daniel''s Old No. 7 750 ml', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-WHISKEY-JACK-HONEY-750', 'Jack Daniel''s Tennessee Honey 750 ml', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-WHISKEY-JAMESON-750', 'Jameson Irish Whiskey 750 ml', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-WHISKEY-MAKERS-750', 'Maker''s Mark 750 ml', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 7, 4, 30, 0, 0, 0, TRUE),
  ('PA-WHISKEY-BULLEIT-750', 'Bulleit Bourbon 750 ml', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 7, 4, 30, 0, 0, 0, TRUE),
  ('PA-WHISKY-MACALLAN-12-700', 'Macallan Double Cask 12 Años 700 ml', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 10, 7, 45, 0, 0, 0, TRUE),
  ('PA-WHISKY-GLENFIDDICH-12-750', 'Glenfiddich 12 Años 750 ml', 'Whisky / Whiskey', 'ml', 'Unidad base', 1, 9, 6, 45, 0, 0, 0, TRUE),

  -- Vodka y ginebra
  ('PA-VODKA-SMIRNOFF-750', 'Smirnoff No. 21 750 ml', 'Vodka', 'ml', 'Unidad base', 1, 4, 3, 21, 0, 0, 0, TRUE),
  ('PA-VODKA-SMIRNOFF-1750', 'Smirnoff No. 21 1.75 L', 'Vodka', 'ml', 'Unidad base', 1, 4, 3, 21, 0, 0, 0, TRUE),
  ('PA-VODKA-ABSOLUT-750', 'Absolut Vodka 750 ml', 'Vodka', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-VODKA-FINLANDIA-750', 'Finlandia Vodka 750 ml', 'Vodka', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-VODKA-TITOS-750', 'Tito''s Handmade Vodka 750 ml', 'Vodka', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-VODKA-KETELONE-750', 'Ketel One Vodka 750 ml', 'Vodka', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-VODKA-GREYGOOSE-700', 'Grey Goose Vodka 700 ml', 'Vodka', 'ml', 'Unidad base', 1, 7, 5, 30, 0, 0, 0, TRUE),
  ('PA-VODKA-BELVEDERE-750', 'Belvedere Vodka 750 ml', 'Vodka', 'ml', 'Unidad base', 1, 7, 5, 30, 0, 0, 0, TRUE),
  ('PA-GIN-GORDONS-750', 'Gordon''s Gin 750 ml', 'Ginebra', 'ml', 'Unidad base', 1, 4, 3, 21, 0, 0, 0, TRUE),
  ('PA-GIN-BEEFEATER-750', 'Beefeater London Dry Gin 750 ml', 'Ginebra', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-GIN-TANQUERAY-750', 'Tanqueray London Dry Gin 750 ml', 'Ginebra', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-GIN-BOMBAY-750', 'Bombay Sapphire 750 ml', 'Ginebra', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-GIN-HENDRICKS-700', 'Hendrick''s Gin 700 ml', 'Ginebra', 'ml', 'Unidad base', 1, 7, 5, 30, 0, 0, 0, TRUE),
  ('PA-GIN-MARTINMILLER-700', 'Martin Miller''s Gin 700 ml', 'Ginebra', 'ml', 'Unidad base', 1, 7, 5, 30, 0, 0, 0, TRUE),
  ('PA-GIN-GINMARE-700', 'Gin Mare 700 ml', 'Ginebra', 'ml', 'Unidad base', 1, 8, 5, 30, 0, 0, 0, TRUE),

  -- Tequila, mezcal, brandy y coñac
  ('PA-TEQ-CUERVO-SILVER-750', 'José Cuervo Especial Silver 750 ml', 'Tequila', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-TEQ-CUERVO-REPO-750', 'José Cuervo Especial Reposado 750 ml', 'Tequila', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-TEQ-JIMADOR-BLANCO-750', 'El Jimador Blanco 750 ml', 'Tequila', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-TEQ-JIMADOR-REPO-750', 'El Jimador Reposado 750 ml', 'Tequila', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-TEQ-1800-SILVER-750', '1800 Silver 750 ml', 'Tequila', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-TEQ-1800-REPO-750', '1800 Reposado 750 ml', 'Tequila', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-TEQ-DONJULIO-BLANCO-750', 'Don Julio Blanco 750 ml', 'Tequila', 'ml', 'Unidad base', 1, 7, 5, 30, 0, 0, 0, TRUE),
  ('PA-TEQ-DONJULIO-REPO-750', 'Don Julio Reposado 750 ml', 'Tequila', 'ml', 'Unidad base', 1, 7, 5, 30, 0, 0, 0, TRUE),
  ('PA-TEQ-DONJULIO-1942-750', 'Don Julio 1942 750 ml', 'Tequila', 'ml', 'Unidad base', 1, 10, 7, 45, 0, 0, 0, TRUE),
  ('PA-TEQ-PATRON-SILVER-750', 'Patrón Silver 750 ml', 'Tequila', 'ml', 'Unidad base', 1, 8, 5, 30, 0, 0, 0, TRUE),
  ('PA-TEQ-CASAMIGOS-REPO-750', 'Casamigos Reposado 750 ml', 'Tequila', 'ml', 'Unidad base', 1, 8, 5, 30, 0, 0, 0, TRUE),
  ('PA-MEZ-400CONEJOS-750', 'Mezcal 400 Conejos 750 ml', 'Mezcal', 'ml', 'Unidad base', 1, 8, 5, 30, 0, 0, 0, TRUE),
  ('PA-MEZ-OJOTIGRE-750', 'Mezcal Ojo de Tigre Joven 750 ml', 'Mezcal', 'ml', 'Unidad base', 1, 8, 5, 30, 0, 0, 0, TRUE),
  ('PA-BRANDY-CARDENAL-750', 'Cardenal Mendoza 750 ml', 'Brandy y coñac', 'ml', 'Unidad base', 1, 8, 5, 30, 0, 0, 0, TRUE),
  ('PA-COGNAC-HENNESSY-VS-700', 'Hennessy V.S 700 ml', 'Brandy y coñac', 'ml', 'Unidad base', 1, 8, 5, 30, 0, 0, 0, TRUE),
  ('PA-COGNAC-HENNESSY-VSOP-700', 'Hennessy V.S.O.P 700 ml', 'Brandy y coñac', 'ml', 'Unidad base', 1, 10, 7, 45, 0, 0, 0, TRUE),

  -- Licores, cremas, aperitivos y bitters
  ('PA-LIQ-BAILEYS-750', 'Baileys Original 750 ml', 'Licores y cremas', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-LIQ-KAHLUA-750', 'Kahlúa 750 ml', 'Licores y cremas', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-LIQ-AMARETTO-700', 'Disaronno Amaretto 700 ml', 'Licores y cremas', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-LIQ-COINTREAU-700', 'Cointreau 700 ml', 'Licores y cremas', 'ml', 'Unidad base', 1, 7, 4, 30, 0, 0, 0, TRUE),
  ('PA-LIQ-TRIPLESEC-700', 'De Kuyper Triple Sec 700 ml', 'Licores y cremas', 'ml', 'Unidad base', 1, 7, 4, 30, 0, 0, 0, TRUE),
  ('PA-LIQ-BLUECURACAO-700', 'De Kuyper Blue Curaçao 700 ml', 'Licores y cremas', 'ml', 'Unidad base', 1, 7, 4, 30, 0, 0, 0, TRUE),
  ('PA-LIQ-PEACHTREE-700', 'De Kuyper Peachtree 700 ml', 'Licores y cremas', 'ml', 'Unidad base', 1, 7, 4, 30, 0, 0, 0, TRUE),
  ('PA-LIQ-MIDORI-1000', 'Midori Licor de Melón 1 L', 'Licores y cremas', 'ml', 'Unidad base', 1, 7, 4, 30, 0, 0, 0, TRUE),
  ('PA-LIQ-LICOR43-750', 'Licor 43 750 ml', 'Licores y cremas', 'ml', 'Unidad base', 1, 7, 4, 30, 0, 0, 0, TRUE),
  ('PA-LIQ-STGERMAIN-700', 'St-Germain 700 ml', 'Licores y cremas', 'ml', 'Unidad base', 1, 8, 5, 30, 0, 0, 0, TRUE),
  ('PA-APER-CAMPARI-750', 'Campari 750 ml', 'Aperitivos y vermut', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-APER-APEROL-750', 'Aperol 750 ml', 'Aperitivos y vermut', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-VERM-MARTINI-ROSSO-1000', 'Martini Rosso 1 L', 'Aperitivos y vermut', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-VERM-MARTINI-DRY-1000', 'Martini Extra Dry 1 L', 'Aperitivos y vermut', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-BITTER-ANGOSTURA-200', 'Angostura Aromatic Bitters 200 ml', 'Amargos y bitters', 'ml', 'Unidad base', 1, 8, 5, 45, 0, 0, 0, TRUE),
  ('PA-BITTER-ORANGE-150', 'Orange Bitters 150 ml', 'Amargos y bitters', 'ml', 'Unidad base', 1, 8, 5, 45, 0, 0, 0, TRUE),

  -- Vinos, espumosos y champagne
  ('PA-WINE-RED-HOUSE-750', 'Vino tinto de la casa 750 ml', 'Vino tinto', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-WINE-CABERNET-750', 'Cabernet Sauvignon 750 ml', 'Vino tinto', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-WINE-MALBEC-750', 'Malbec 750 ml', 'Vino tinto', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-WINE-MERLOT-750', 'Merlot 750 ml', 'Vino tinto', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-WINE-WHITE-HOUSE-750', 'Vino blanco de la casa 750 ml', 'Vino blanco', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-WINE-SAUVBLANC-750', 'Sauvignon Blanc 750 ml', 'Vino blanco', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-WINE-CHARDONNAY-750', 'Chardonnay 750 ml', 'Vino blanco', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-WINE-PINOTGRIGIO-750', 'Pinot Grigio 750 ml', 'Vino blanco', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-WINE-ROSE-HOUSE-750', 'Vino rosado de la casa 750 ml', 'Vino rosado', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-SPARK-PROSECCO-750', 'Prosecco 750 ml', 'Vino espumoso', 'ml', 'Unidad base', 1, 7, 5, 30, 0, 0, 0, TRUE),
  ('PA-SPARK-CAVA-750', 'Cava Brut 750 ml', 'Vino espumoso', 'ml', 'Unidad base', 1, 7, 5, 30, 0, 0, 0, TRUE),
  ('PA-CHAMP-MOET-BRUT-750', 'Moët & Chandon Brut Impérial 750 ml', 'Champagne', 'ml', 'Unidad base', 1, 10, 7, 45, 0, 0, 0, TRUE),
  ('PA-CHAMP-VEUVE-BRUT-750', 'Veuve Clicquot Brut 750 ml', 'Champagne', 'ml', 'Unidad base', 1, 10, 7, 45, 0, 0, 0, TRUE),

  -- Aguas, gaseosas, tónicas y energéticas
  ('PA-WATER-CRISTALINA-600', 'Agua Cristalina 600 ml', 'Aguas', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-WATER-DASANI-600', 'Agua Dasani 600 ml', 'Aguas', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-WATER-PERRIER-330', 'Perrier 330 ml', 'Aguas', 'unit', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-WATER-SPELLEGRINO-250', 'S.Pellegrino 250 ml', 'Aguas', 'unit', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-SODA-COCACOLA-355', 'Coca-Cola 355 ml', 'Gaseosas y sodas', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-SODA-COCACOLA-ZERO-355', 'Coca-Cola Zero 355 ml', 'Gaseosas y sodas', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-SODA-SPRITE-355', 'Sprite 355 ml', 'Gaseosas y sodas', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-SODA-FRESCA-355', 'Fresca 355 ml', 'Gaseosas y sodas', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-SODA-GINGER-ALE-355', 'Ginger Ale 355 ml', 'Gaseosas y sodas', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-SODA-CLUB-355', 'Club Soda 355 ml', 'Gaseosas y sodas', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-TONIC-SCHWEPPES-355', 'Schweppes Tónica 355 ml', 'Tónicas', 'unit', 'Unidad base', 1, 4, 3, 18, 0, 0, 0, TRUE),
  ('PA-TONIC-FEVERTREE-200', 'Fever-Tree Indian Tonic 200 ml', 'Tónicas', 'unit', 'Unidad base', 1, 7, 4, 30, 0, 0, 0, TRUE),
  ('PA-ENERGY-REDBULL-250', 'Red Bull 250 ml', 'Bebidas energéticas', 'unit', 'Unidad base', 1, 4, 3, 18, 0, 0, 0, TRUE),
  ('PA-ENERGY-REDBULL-SF-250', 'Red Bull Sugarfree 250 ml', 'Bebidas energéticas', 'unit', 'Unidad base', 1, 4, 3, 18, 0, 0, 0, TRUE),
  ('PA-ENERGY-MONSTER-473', 'Monster Energy 473 ml', 'Bebidas energéticas', 'unit', 'Unidad base', 1, 5, 3, 18, 0, 0, 0, TRUE),
  ('PA-ENERGY-CELSIUS-355', 'Celsius 355 ml', 'Bebidas energéticas', 'unit', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),

  -- Jugos, siropes, purés y café
  ('PA-JUICE-ORANGE-1000', 'Jugo de naranja 1 L', 'Jugos y néctares', 'ml', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-JUICE-PINEAPPLE-1000', 'Jugo de piña 1 L', 'Jugos y néctares', 'ml', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-JUICE-CRANBERRY-1000', 'Jugo de cranberry 1 L', 'Jugos y néctares', 'ml', 'Unidad base', 1, 4, 3, 18, 0, 0, 0, TRUE),
  ('PA-JUICE-TOMATO-1000', 'Jugo de tomate 1 L', 'Jugos y néctares', 'ml', 'Unidad base', 1, 4, 3, 18, 0, 0, 0, TRUE),
  ('PA-JUICE-GRAPEFRUIT-1000', 'Jugo de toronja 1 L', 'Jugos y néctares', 'ml', 'Unidad base', 1, 4, 3, 18, 0, 0, 0, TRUE),
  ('PA-SYRUP-SIMPLE-1000', 'Sirope simple 1 L', 'Siropes y cordiales', 'ml', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-SYRUP-GRENADINE-750', 'Granadina 750 ml', 'Siropes y cordiales', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-SYRUP-ORGEAT-750', 'Sirope de almendra Orgeat 750 ml', 'Siropes y cordiales', 'ml', 'Unidad base', 1, 7, 4, 30, 0, 0, 0, TRUE),
  ('PA-SYRUP-VANILLA-750', 'Sirope de vainilla 750 ml', 'Siropes y cordiales', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-SYRUP-PASSION-750', 'Sirope de maracuyá 750 ml', 'Siropes y cordiales', 'ml', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-PUREE-PASSION-1000', 'Puré de maracuyá 1 kg', 'Purés', 'gram', 'Unidad base', 1, 5, 3, 18, 0, 0, 0, TRUE),
  ('PA-PUREE-STRAWBERRY-1000', 'Puré de fresa 1 kg', 'Purés', 'gram', 'Unidad base', 1, 5, 3, 18, 0, 0, 0, TRUE),
  ('PA-PUREE-MANGO-1000', 'Puré de mango 1 kg', 'Purés', 'gram', 'Unidad base', 1, 5, 3, 18, 0, 0, 0, TRUE),
  ('PA-COFFEE-GEISHA-1000', 'Café Geisha en grano 1 kg', 'Café y té', 'gram', 'Unidad base', 1, 7, 4, 30, 0, 0, 0, TRUE),
  ('PA-COFFEE-ESPRESSO-1000', 'Café espresso en grano 1 kg', 'Café y té', 'gram', 'Unidad base', 1, 5, 3, 21, 0, 0, 0, TRUE),
  ('PA-TEA-BLACK-100', 'Té negro en sobres', 'Café y té', 'unit', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),

  -- Frutas, hierbas, garnishes y hielo
  ('PA-FRUIT-LIME-1000', 'Limón criollo', 'Frutas y cítricos', 'gram', 'Unidad base', 1, 2, 1, 7, 0, 0, 0, TRUE),
  ('PA-FRUIT-LEMON-1000', 'Limón amarillo', 'Frutas y cítricos', 'gram', 'Unidad base', 1, 3, 1, 7, 0, 0, 0, TRUE),
  ('PA-FRUIT-ORANGE-1000', 'Naranja', 'Frutas y cítricos', 'gram', 'Unidad base', 1, 2, 1, 7, 0, 0, 0, TRUE),
  ('PA-FRUIT-GRAPEFRUIT-1000', 'Toronja', 'Frutas y cítricos', 'gram', 'Unidad base', 1, 3, 1, 7, 0, 0, 0, TRUE),
  ('PA-FRUIT-PINEAPPLE-UNIT', 'Piña', 'Frutas y cítricos', 'unit', 'Unidad base', 1, 2, 1, 7, 0, 0, 0, TRUE),
  ('PA-FRUIT-STRAWBERRY-454', 'Fresa 454 g', 'Frutas y cítricos', 'gram', 'Unidad base', 1, 2, 1, 7, 0, 0, 0, TRUE),
  ('PA-HERB-MINT-100', 'Hierbabuena 100 g', 'Hierbas y especias', 'gram', 'Unidad base', 1, 2, 1, 5, 0, 0, 0, TRUE),
  ('PA-HERB-ROSEMARY-100', 'Romero 100 g', 'Hierbas y especias', 'gram', 'Unidad base', 1, 3, 1, 7, 0, 0, 0, TRUE),
  ('PA-SPICE-CINNAMON-100', 'Canela en rama 100 g', 'Hierbas y especias', 'gram', 'Unidad base', 1, 5, 3, 30, 0, 0, 0, TRUE),
  ('PA-SPICE-SALT-1000', 'Sal fina 1 kg', 'Hierbas y especias', 'gram', 'Unidad base', 1, 4, 3, 30, 0, 0, 0, TRUE),
  ('PA-SPICE-TAJIN-400', 'Tajín 400 g', 'Hierbas y especias', 'gram', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-GARNISH-CHERRY-750', 'Cerezas para cóctel 750 g', 'Decoraciones / garnishes', 'gram', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-GARNISH-OLIVES-500', 'Aceitunas verdes 500 g', 'Decoraciones / garnishes', 'gram', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-GARNISH-DEHYDRATED-100', 'Cítricos deshidratados 100 g', 'Decoraciones / garnishes', 'gram', 'Unidad base', 1, 7, 4, 30, 0, 0, 0, TRUE),
  ('PA-ICE-BAG-5KG', 'Hielo en cubos 5 kg', 'Hielo', 'gram', 'Unidad base', 1, 1, 1, 3, 0, 0, 0, TRUE),

  -- Alimentos y cocina
  ('PA-DAIRY-CREAM-1000', 'Crema de leche 1 L', 'Lácteos y cremas', 'ml', 'Unidad base', 1, 3, 1, 7, 0, 0, 0, TRUE),
  ('PA-DAIRY-MILK-1000', 'Leche entera 1 L', 'Lácteos y cremas', 'ml', 'Unidad base', 1, 3, 1, 7, 0, 0, 0, TRUE),
  ('PA-CHEESE-MIX-1000', 'Selección de quesos curados 1 kg', 'Embutidos y quesos', 'gram', 'Unidad base', 1, 5, 2, 14, 0, 0, 0, TRUE),
  ('PA-IBERICO-HAM-500', 'Jamón ibérico 500 g', 'Embutidos y quesos', 'gram', 'Unidad base', 1, 7, 3, 14, 0, 0, 0, TRUE),
  ('PA-TUNA-LOIN-1000', 'Lomo de atún 1 kg', 'Pescados y mariscos', 'gram', 'Unidad base', 1, 4, 2, 10, 0, 0, 0, TRUE),
  ('PA-SHRIMP-1000', 'Camarón limpio 1 kg', 'Pescados y mariscos', 'gram', 'Unidad base', 1, 4, 2, 10, 0, 0, 0, TRUE),
  ('PA-CHICKEN-1000', 'Pollo 1 kg', 'Carnes', 'gram', 'Unidad base', 1, 3, 2, 10, 0, 0, 0, TRUE),
  ('PA-BEEF-1000', 'Carne de res 1 kg', 'Carnes', 'gram', 'Unidad base', 1, 4, 2, 10, 0, 0, 0, TRUE),
  ('PA-BREAD-BAGUETTE-UNIT', 'Baguette', 'Panadería', 'unit', 'Unidad base', 1, 2, 1, 5, 0, 0, 0, TRUE),
  ('PA-SNACK-PLANTAIN-500', 'Platanitos 500 g', 'Snacks', 'gram', 'Unidad base', 1, 4, 3, 21, 0, 0, 0, TRUE),
  ('PA-SNACK-MIXEDNUTS-500', 'Nueces mixtas 500 g', 'Snacks', 'gram', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),
  ('PA-CHOC-DARK-1000', 'Chocolate oscuro 1 kg', 'Chocolates y postres', 'gram', 'Unidad base', 1, 7, 4, 30, 0, 0, 0, TRUE),
  ('PA-SAUCE-SOY-1000', 'Salsa de soya 1 L', 'Salsas y condimentos', 'ml', 'Unidad base', 1, 5, 3, 30, 0, 0, 0, TRUE),
  ('PA-SAUCE-HOT-150', 'Salsa picante 150 ml', 'Salsas y condimentos', 'ml', 'Unidad base', 1, 5, 3, 30, 0, 0, 0, TRUE),
  ('PA-OIL-OLIVE-1000', 'Aceite de oliva 1 L', 'Insumos de cocina', 'ml', 'Unidad base', 1, 6, 4, 30, 0, 0, 0, TRUE),

  -- Barra, desechables, limpieza y cristalería
  ('PA-BAR-STRAWS-500', 'Carrizos negros', 'Insumos de barra', 'unit', 'Unidad base', 1, 5, 3, 30, 0, 0, 0, TRUE),
  ('PA-BAR-STIRRERS-500', 'Removedores de cóctel', 'Insumos de barra', 'unit', 'Unidad base', 1, 5, 3, 30, 0, 0, 0, TRUE),
  ('PA-BAR-COASTERS-500', 'Posavasos', 'Insumos de barra', 'unit', 'Unidad base', 1, 7, 5, 45, 0, 0, 0, TRUE),
  ('PA-BAR-NAPKINS-500', 'Servilletas de cóctel negras', 'Desechables', 'unit', 'Unidad base', 1, 5, 3, 30, 0, 0, 0, TRUE),
  ('PA-DISP-CUP-12OZ-50', 'Vaso desechable 12 oz', 'Desechables', 'unit', 'Unidad base', 1, 5, 3, 30, 0, 0, 0, TRUE),
  ('PA-DISP-CUP-16OZ-50', 'Vaso desechable 16 oz', 'Desechables', 'unit', 'Unidad base', 1, 5, 3, 30, 0, 0, 0, TRUE),
  ('PA-DISP-GLOVES-100', 'Guantes desechables', 'Desechables', 'unit', 'Unidad base', 1, 5, 3, 30, 0, 0, 0, TRUE),
  ('PA-CLEAN-DEGREASER-3785', 'Desengrasante 1 galón', 'Limpieza e higiene', 'ml', 'Unidad base', 1, 5, 3, 30, 0, 0, 0, TRUE),
  ('PA-CLEAN-DISHSOAP-3785', 'Detergente lavavajillas 1 galón', 'Limpieza e higiene', 'ml', 'Unidad base', 1, 5, 3, 30, 0, 0, 0, TRUE),
  ('PA-CLEAN-SANITIZER-3785', 'Desinfectante 1 galón', 'Limpieza e higiene', 'ml', 'Unidad base', 1, 5, 3, 30, 0, 0, 0, TRUE),
  ('PA-CLEAN-HANDSOAP-3785', 'Jabón de manos 1 galón', 'Limpieza e higiene', 'ml', 'Unidad base', 1, 5, 3, 30, 0, 0, 0, TRUE),
  ('PA-CLEAN-PAPERTOWEL-6', 'Papel toalla', 'Limpieza e higiene', 'unit', 'Unidad base', 1, 5, 3, 30, 0, 0, 0, TRUE),
  ('PA-CLEAN-TOILETPAPER-12', 'Papel higiénico', 'Limpieza e higiene', 'unit', 'Unidad base', 1, 5, 3, 30, 0, 0, 0, TRUE),
  ('PA-CLEAN-TRASHBAG-50', 'Bolsas de basura grandes', 'Limpieza e higiene', 'unit', 'Unidad base', 1, 5, 3, 30, 0, 0, 0, TRUE),
  ('PA-GLASS-ROCKS-12', 'Vaso rocks', 'Cristalería', 'unit', 'Unidad base', 1, 10, 5, 45, 0, 0, 0, TRUE),
  ('PA-GLASS-HIGHBALL-12', 'Vaso highball', 'Cristalería', 'unit', 'Unidad base', 1, 10, 5, 45, 0, 0, 0, TRUE),
  ('PA-GLASS-WINE-12', 'Copa de vino', 'Cristalería', 'unit', 'Unidad base', 1, 10, 5, 45, 0, 0, 0, TRUE),
  ('PA-GLASS-CHAMP-12', 'Copa flauta de champagne', 'Cristalería', 'unit', 'Unidad base', 1, 10, 5, 45, 0, 0, 0, TRUE),
  ('PA-GLASS-SHOT-12', 'Vaso de shot', 'Cristalería', 'unit', 'Unidad base', 1, 10, 5, 45, 0, 0, 0, TRUE),
  ('PA-GLASS-MARTINI-12', 'Copa martini', 'Cristalería', 'unit', 'Unidad base', 1, 10, 5, 45, 0, 0, 0, TRUE);

SET @nox_seed_inserted = ROW_COUNT();

-- Normaliza únicamente artículos del catálogo que aún no tienen movimientos
-- ni compras. Nunca modifica artículos que ya tienen historial operativo.
UPDATE inventory_items i
SET i.package_name = 'Unidad base',
    i.units_per_package = 1
WHERE i.sku LIKE 'PA-%'
  AND i.current_stock = 0
  AND i.average_cost = 0
  AND NOT EXISTS (
    SELECT 1
    FROM purchase_items pi
    WHERE pi.inventory_item_id = i.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM inventory_movements im
    WHERE im.inventory_item_id = i.id
  );

COMMIT;

SELECT
  @nox_seed_inserted AS articulos_agregados,
  COUNT(*) AS total_articulos_activos
FROM inventory_items
WHERE active = TRUE;
