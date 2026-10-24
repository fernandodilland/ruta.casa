# Pendientes — Metrorrey 3D (ruta.casa)

Lista pedida el 23-oct-2026. Se va tachando conforme se hace, cosa por cosa.

## Correcciones al modelo actual
- [x] Corregir el ancho de vías y andén (vía 1,435 mm, hueco tren–andén
      real, separación entre vías para que dos trenes se crucen bien)
- [x] Segundo metro en sentido contrario (vía contraria, con su ciclo)
- [x] El tren deben ser **2 vagones**: cada vagón inicia, en medio lleva
      su gusano (fuelle de articulación) y termina; entre vagón y vagón
      la conexión va ligeramente separada, y luego el otro vagón
- [x] Corregir cuando «salta» el metro (quitar el brinco/balanceo vertical)
- [x] Quitar los palos verticales interiores de la estación junto a las
      entradas de los vagones (no existen)
- [x] Quitar los carros de abajo (calle limpia)
- [x] Las puertas solo se abren del lado donde sube la gente, no de los dos
- [x] Quitar las líneas blancas verticales en las puntas del metro
      (no las lleva)
- [x] Mejorar las iluminaciones
- [x] Pared transparente también (no solo el techo) en el metro más
      cercano a la vista; el metro lejano mantiene techo y paredes

## Gente generativa
- [x] Personas generativas aleatorias: a veces poca gente, a veces mucha
      (andén e interior, colores/poses/alturas al azar por ciclo)

## Escenarios (botones configurables)
- [x] Lluvia
- [x] Noche
- [x] Soleado mediodía
- [x] Amaneciendo
- [x] (botón de escenario aleatorio)
- [x] Al entrar por primera vez el escenario es siempre Noche (sustituye
      al azar anterior); Tren MM-05 en «Visible» y Estación en
      «Auto (cerca / arriba)»
- [x] URL compartible: la dirección siempre trae vista, cámara
      (objetivo/distancia/acimut/polar, o pos+yaw/pitch en primera
      persona) y ajustes completos (escenario, estación/tren y
      opacidades); al abrir el enlace se restaura todo igual
- [x] Gotas de lluvia en los vidrios por fuera (parabrisas, ventanas y
      puertas): microgotas quietas y gotas que resbalan con estela; se
      mojan al llover y se secan poco a poco al cambiar de escenario

## Vistas y manejo
- [x] En vista aérea, hacer transparentes letreros, tubos, etc. y mostrar
      el tren conforme al ángulo desde el que se vea
- [x] Escena primera persona caminando (andén/calle)
- [x] En cabina, el giro de vista en primera persona sin salir de la cabina
- [x] En cabina: manejo automático (que conduzca solo y pare en estación)
- [x] Palanca de acelerar/desacelerar con mouse

## Navegación del sitio
- [x] La página de inicio sigue siendo el metro; en el texto «Metrorrey»
      de arriba a la izquierda poner botón **Salir** que mande a `/ruta`
- [x] `/ruta` como página independiente tipo *roadmap* de lo que vendrá

## Gente, cabina y línea infinita (23-oct-2026, tarde)
- [x] La gente ya no se vuelve transparente al subir: entra de verdad al
      vagón (cruza la puerta) y se sienta o se agarra del tubo/pasamanos
- [x] IA de personas con sentido: llegan por la escalera, esperan cerca de
      una puerta o en banca, voltean al tren que llega, dejan bajar antes
      de subir (fila a los lados), los que bajan se van por la escalera;
      si llegan tarde corren a la puerta; vigilante que patrulla
- [x] Mejor diseño de personas: esqueleto articulado, caminata animada,
      ropa, peinados, piel, estatura y complexión variados
- [x] Abordaje coherente al llegar el tren: sin «cambio de animación» ni
      gente que aparece/desaparece; las puertas cierran cuando terminan
- [x] Bug de atorados en escaleras a los minutos: el clamp lateral del
      andén (frente de bancas) dejaba inalcanzables las bocas de escalera
      (z 3.9 / −7.95) y la gente orbitaba ahí; además carriles por sentido
      en escaleras, llegada por cercanía/rebase en puntos intermedios y
      empuje de multitud topado (ya no supera el avance propio)
- [x] Piloto automático en cabina: activo al entrar, frena con curva suave,
      para exacto, espera el abordaje y sigue sin fin (ya no se detiene)
- [x] Línea infinita procedural: la siguiente estación se ve al fondo,
      ciudad distinta por tramo, trenes que llegan desde la distancia
- [x] Escaleras reales andén ↔ calle (también en «Caminar»)

## Espejo, diseño y rendimiento (23-oct-2026, noche)
- [x] Espejos colgados del techo, uno en cada andén (uno por metro),
      adelante de la cabina; el reflejo solo del lado del conductor (por
      detrás, carcasa naranja); más grandes y con vista convexa de las
      puertas para ver bien cuando se sube la gente
- [x] Optimización general (estaba muy lento): espejo sin CubeCamera,
      fusión de mallas fijas, instancias con recorte, sin luces puntuales
      de día ni en vagones, sombras cada 2 cuadros, resolución adaptable
- [x] Diseño según `visual-plan/`: caja de A/A gris topo sobre cada cabina
      del MM-05, piso de granito pulido, techo de lámina acanalada con
      marcos azules curvos, letreros de andén blancos con franja verde L2,
      reflejos del cielo en metales y cristales, mejor contraste de luz
- [x] Pasamanos interiores ya no entran a la cabina (iban duplicados) y el
      letrero de la fachada del viaducto ya no queda dentro de la losa

## Velocidad y vía (23-oct-2026, noche)
- [x] Velocidad punta 80 km/h (automático y manual); estaciones a 736 m
      para que dé tiempo de alcanzarla; los trenes de la vista libre
      llegan a 60 km/h
- [x] Vía completa en todo el recorrido y en ambas vías: balasto,
      durmientes de concreto con placas y rieles continuos (antes solo
      había durmientes 84 m en la vía 1 de la estación)

## Interfaz discreta (23-oct-2026, noche)
- [x] «Techos y paredes» y «Escenario» dentro de un menú ⚙ Ajustes
      desplegable en el panel de estado (se cierra al tocar fuera / Esc)
- [x] Ayuda como botón «?»; se oculta en Cabina y Caminar
- [x] Controles de conductor y de caminar minimizados por defecto, a un
      lado (tira con velocidad y aviso) con botón para desplegarlos
- [x] En móvil, la barra de vistas en un solo renglón deslizable

## Primera persona (23-oct-2026, noche)
- [x] Caminar y Cabina: arrastrar a la derecha mira a la derecha y hacia
      arriba mira arriba (antes iba invertido)
- [x] En Caminar y Cabina no se desvanecen paredes ni techos de trenes ni
      de estaciones (el modo Auto aplica solo en las vistas libres)
- [x] Cambio de vista limpio: se ocultan los controles de la vista anterior,
      se sueltan teclas/botones sostenidos, Caminar empieza en el andén y
      la Cabina mirando al frente

## Caminar y gente (23-oct-2026, noche)
- [x] Caminar: ojos a 1.58 m (antes 1.70) y ya se puede subir/bajar del
      tren por una puerta abierta del lado del andén (había un hueco entre
      andén y tren que lo impedía); adentro viajas con el tren
- [x] Peatones que se topan de frente: se hacen a su derecha y pasan
- [x] Fila ordenada para bajar en cada puerta (nadie se encima; al salir
      uno avanzan los demás)
- [x] Momento para prepararse al azar: unos antes de llegar (sobre todo
      los que ya iban de pie), otros al frenar y otros hasta que el tren
      se detiene

## Parada suave y reflejo propio (23-oct-2026, noche)
- [x] Cabina automática: ya no hay brinco al llegar (antes saltaba 24 cm
      al «encajar» en la marca); curva de frenado final que llega a cero
      justo en la marca; la resolución adaptable ya no cambia por un pico
- [x] En Caminar te ves en el espejo (tu cuerpo solo lo ven los espejos,
      camina y voltea contigo); en Cabina el conductor sale en el espejo;
      la gente del andén te esquiva

## Sentarse, ventanas y recorrido (23-oct-2026, noche)
- [x] En Caminar te sientas al acercarte a un asiento libre (banca del
      andén o asiento del vagón) con transición; W/↑ te para y das un paso
      al frente; el asiento queda ocupado; tu cuerpo sentado sale en el espejo
- [x] Ventanas de las puertas transparentes (hueco + cristal que se mueve
      con la hoja)
- [x] Vidrios claros como los de las puertas en las ventanas laterales de
      cada vagón (doble cara: también se ven desde el interior, y se
      desvanecen con la pared de su lado)
- [x] Ventana en el mamparo de cabina (se ve al conductor de espaldas; la
      puerta de cabina pasó al otro lado) y ventanas en los testeros entre
      vagones con fuelle hueco: se ve el otro vagón
- [x] La ventana del mamparo tras el conductor lleva marco de sello como
      los testeros: su cristal claro ya no parece un hueco sin vidrio
- [x] El frente ya se ve por dentro en Caminar/Cabina: parabrisas y
      chaflanes de doble cara y forro interior que rodea el parabrisas;
      frente al conductor ya no hay vacío
- [x] Respaldos de las bancas del salón verticales, sin la inclinación
      hacia adelante que traían arriba
- [x] Vía en placa como el metro real: fuera la gravilla/balasto; placa
      plana de concreto gris oscuro, sólida y sin textura, unida a la
      losa del viaducto bajo durmientes y rieles
- [x] De noche el salón se ilumina desde el plafón: dos luces cálidas por
      coche y la tira brilla más; también prenden bajo tierra
- [x] Anuncios del interior (Cerro de la Silla, Parque Fundidora…)
      verticales contra la pared, sin la inclinación que traían
- [x] Pantógrafo de brazo único en «V» acostada (ya no el rombo de
      tijera doble) y chispazo eléctrico muy ocasional al contacto
      con el hilo, solo con el tren en marcha
- [x] Sentados con los pies en el piso a cualquier estatura: la pose
      resuelve muslo y rodilla por geometría y recorre la cadera sobre
      el asiento; ya no flotan dentro del vagón (visible en la Línea 2)
- [x] Dentro del vagón no se atraviesan el mamparo ni el testero
- [x] Si estás parado, la gente siempre te rodea (si su punto cae encima de
      ti lo recorre a un lado y si un lado está cerrado rodea por el otro)
- [x] Reiniciar recorrido ya no reinicia a la gente: solo vuelve a llegar el
      tren (en cabina, arranca a 220 m en automático)

## Estaturas, sentarse y choques (23-oct-2026, noche)
- [x] Estaturas mexicanas: la mayoría cerca de 1.60 m (mujeres ~1.55,
      hombres ~1.64, de ~1.45 a 1.75); en Caminar los ojos a 1.49 m
      (persona de 1.60) y 1.12 m sentado
- [x] Sentarse sin deslizarse: llegan al frente del asiento, giran y bajan
      la cadera hacia atrás con los pies fijos (igual al pararse)
- [x] La falda sigue a los muslos al sentarse (ya no atraviesa asientos)
- [x] Un asiento, una persona: se aparta en cuanto se elige
- [x] La gente ya no camina dentro de bancas ni asientos (pasillo del
      vagón y frente de las bancas como límite)
- [x] En Caminar no atraviesas a la gente: si chocas te desliza por su
      costado y sigues avanzando

## Viajar a bordo (23-oct-2026, noche)
- [x] En Caminar, si vas dentro del tren ya no se reemplazan los pasajeros
      en cada vuelta: el tren recorre la línea infinita en automático (sin
      brincos de tramo), a bordo solo cambian quienes bajan y suben, y cada
      estación nueva trae otra gente en el andén; al bajarte vuelve al ciclo

## Personajes más realistas (23-oct-2026, noche)
- [x] Sentados: las manos descansan sobre los muslos (antes flotaban
      frente al pecho)
- [x] Manos con palma, dedos y pulgar; muñecas, codos y rodillas
      redondeados (sin huecos al doblar)
- [x] Tronco con forma (cintura, pecho, hombros; cadera más ancha en
      mujeres), cuello de la prenda, cejas, boca y mandíbula
- [x] Zapatos con punta y suela (tenis con suela clara)
- [x] Se probaron personajes Quaternius CC0 (glTF con esqueleto) y se
      quitaron: pesaban más y daban fallas (manos, poses). Se regresó a las
      personas sencillas
- [x] Cada persona sencilla es una sola malla (1 llamada de dibujo en vez
      de ~11) con las mismas animaciones; espejos redibujados 1 de cada 4
      cuadros

## Transbordo subterráneo L2 (23-oct-2026)
- [x] La elevada es Línea 1 (Talleres ↔ Exposición): letreros, LED,
      estado y destinos renombrados; la subterránea es Línea 2
- [x] Línea elevada 3.5 m más alta para que quepa la conexión N2 sobre la
      calle
- [x] 5 niveles caminables: andenes L1 → N2 (salidas sur y poniente) →
      pasarela → edificio de transbordo N3 → distribuidor N4 → andenes L2
- [x] Túnel infinito de L2 con dos MM-05 que llegan, abren, esperan y
      salen; pasajeros a bordo y gente esperando
- [x] Vistas «Andén L2», «Viajar L2» (cabina sin fin) y «Corte»; «Ir a…»
      al caminar
- [x] La gente de L1 entra y sale por N2 (sur, poniente o por N3)
- [x] Abordar el tren de L2 caminando, sentarse y viajar sin fin; su
      gente sube, baja y llega desde la calle
- [x] Arreglos: hueco en el terreno para la escalera de N3 a N4, vías sin
      parpadeo, esquinas de cabina sanas en el tren girado (los chaflanes
      usaban lookAt en coordenadas del mundo)
- [ ] Transbordo de gente N1 ↔ N5. Detalle en
      [estacion-subterranea-transbordo-pendiente.md](estacion-subterranea-transbordo-pendiente.md)

## Roadmap futuro (solo anotado en `/ruta`, no se construye todavía)
- [ ] Juego multijugador
- [ ] Metros CRRC unidades MM-20 – MM-25
- [ ] Todas las estaciones Línea 1
- [ ] Todas las estaciones Línea 2
- [ ] Todas las estaciones Línea 3
- [ ] Metro de Ciudad de México
- [ ] Metro de Guadalajara

## Ya hecho antes de esta lista (referencia)
- Tren Bombardier MM-05 fiel a fotos (doble franja roja, logo central,
  número M1, nariz con esquinas achaflanadas), interior completo visible
- Techos de estación y tren transparentes configurables/automáticos
- Modo conductor en cabina con ruta infinita e interlock de puertas
  (ahora línea infinita real con estación al fondo, ver arriba)
- Espejo convexo fijo del andén con reflejo en vivo
