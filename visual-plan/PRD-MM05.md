# PRD visual — Bombardier MM-05 Metrorrey (Three.js local)

Fuentes (en `refs/`, Wikimedia Commons): `mm05-front-side.png` (MM-05 M1.0080,
3/4 frente+lateral, la referencia principal), `mm90a-2024.jpg` (frente casi
recto, misma familia/librea), `mm93-side.png` y `talleres-arrival.jpg`
(3/4 contrario), `interior-mm93.jpg` (interior de la familia MM-90/93; el
MM-05 es un MM-90 modernizado — 14 vehículos Bombardier, 300 pasajeros,
formación de 3 coches en servicio, catenaria 1,500 V CD, vía 1,435 mm).
Incertidumbre declarada: no hay foto pública localizada del interior
específico del MM-05 ni cenital del techo; se usan el interior MM-93 y los
equipos de techo visibles en los 3/4.

## Balizado (corregido contra fotos; el modelo anterior traía 1 franja)
- Banda superior azul rey `#1e4fa3` (techo y frente de cabina completos).
- **Dos** franjas rojas `#dd2c20`: una alta bajo el azul y una baja a media
  puerta. Blanco `#f1f1ee` entre y bajo ellas. Faldón inferior gris topo.
- Frente: azul ~55 % superior, franja roja al centro, blanco abajo, topo al pie.
- Logo clásico al centro del frente, sobre trapecio blanco que interrumpe la
  franja roja: «m» roja de barras inclinadas con estelas de velocidad a la
  izquierda + `metrorrey` azul en itálica debajo. El mismo logo en el lateral,
  bajo la primera ventana, montado sobre la franja roja baja.
- Número `M1. 0080` negro pequeño bajo la franja roja lateral.

## Exterior medido de las fotos
- Parabrisas único enorme con esquinas redondeadas y sello negro; letrero de
  destino **dentro** del parabrisas (MM-05: LED ámbar de puntos `EXPOSICION`;
  se usa `SENDERO` por el sentido de la escena). Limpiaparabrisas central en
  diagonal + uno estacionado.
- Faros: dos carcasas negras rectangulares bajas, gemelas, con marcadores
  verticales rojo/ámbar interiores. Trasera igual con luces rojas.
- Ventanas oscuras de esquinas redondeadas, sello negro grueso, algunas con
  ventila corrediza superior. Puertas dobles blancas, ventana alta por hoja,
  calcomanía amarilla «PERMITA SALIR ANTES DE ENTRAR», sello central negro.
- Luz ámbar pequeña sobre cada puerta; rejilla de ventilación baja entre
  puertas; espejos de cabina; acoplador expuesto con mangueras y estribos.
- Techo: caja de A/A gris topo con rejillas sobre la cabina y equipos grises;
  pantógrafo de rombo tocando el hilo de contacto.

## Interior (de `interior-mm93.jpg`)
- Bancas longitudinales corridas en ambos muros, moldeadas, alternando azul
  celeste `#8fd0ea` y crema por plaza (asiento y respaldo).
- Tubos de acero inoxidable: verticales curvos junto a puertas/vestíbulos y
  pasamanos longitudinales bajo el techo. Sin correas colgantes visibles.
- Techo blanco con tira fluorescente longitudinal continua; paneles
  publicitarios/mapa inclinados sobre las ventanas; piso gris antideslizante
  con puntos; muros blanco hueso; puertas blancas por dentro.
- Cabina visible tras el parabrisas: consola oscura, asiento del conductor.

## Techos transparentes (requisito nuevo)
- Techo de estación y techo+plafón del tren con modos Auto / Visible /
  Transparente / Oculto y control de opacidad mínima para cada uno.
- Auto: se desvanece suave al acercarse la cámara o al ver desde arriba;
  regresa al alejarse. Vistas nuevas: Interior (la cámara viaja con el tren)
  y Cenital.

## Aceptación
Capturas del navegador (frente 3/4, lateral, cenital con techos
transparentes e interior desde el pasillo) comparadas contra las referencias;
corregir la diferencia más visible y repetir.
