# Pendientes — ruta.casa (Metrorrey 3D)

Lista inicial pedida el 23-oct-2026. Abiertos primero; después la bitácora de lo hecho (comprimida, por área). Roadmap por sistema/línea: `README.md`. Spec del transbordo: `transbordo-cuauhtemoc.md`.

## Abiertos
- [ ] Transbordo de gente N1 ↔ N5; filas en torniquetes/escaleras; escaleras eléctricas o elevador; Ajustes › «Techos y paredes» para el edificio N3; aligerar vista «Corte» (detalle en `transbordo-cuauhtemoc.md`)
- [ ] Roadmap (solo anotado en `/ruta` y README, no se construye aún): multijugador; trenes CRRC MM-20–MM-25; todas las estaciones L1, L2, L3; Metro CDMX; Metro/Tren Ligero Guadalajara; curvas y recorrido real

## Hecho (bitácora, 23-oct-2026 salvo nota)
**Modelo y tren**
- Vía 1,435 mm, hueco tren–andén real, separación entre vías para cruce; segundo metro en sentido contrario con su ciclo
- Tren = 2 vagones con fuelle (gusano) y separación entre vagones; sin brinco/balanceo vertical; quitadas líneas blancas verticales en puntas, palos interiores junto a entradas y carros de la calle
- Puertas solo abren del lado del andén; ventanas de puertas transparentes (hueco + cristal que se mueve con la hoja); vidrios claros de doble cara en ventanas laterales; ventana en mamparo de cabina (conductor de espaldas, con marco de sello) y en testeros con fuelle hueco (se ve el otro vagón); frente visible por dentro (parabrisas/chaflanes doble cara, forro interior)
- Diseño según `visual-plan/`: caja A/A gris topo sobre cabinas, piso de granito pulido, techo de lámina acanalada con marcos azules, letreros de andén blancos con franja verde L2, reflejos de cielo en metales/cristales; pasamanos ya no entran a la cabina; letrero de fachada del viaducto fuera de la losa
- Respaldos de bancas y anuncios verticales; pantógrafo de brazo único en «V» con chispazo ocasional (solo en marcha)
- Vía en placa de concreto gris oscuro, sólida, sin textura, unida a la losa (sin balasto); vía completa en todo el recorrido y ambas vías
- Luces: mejores iluminaciones; de noche el salón se ilumina desde el plafón (2 luces cálidas por coche, tira más brillante, también bajo tierra); pared transparente además del techo en el metro cercano (el lejano mantiene techo y paredes)
- Gotas de lluvia en vidrios por fuera (microgotas quietas + gotas que resbalan con estela; se secan al cambiar de escenario)

**Escenarios y URL**
- Mediodía, amanecer, lluvia, noche, botón aleatorio; al entrar siempre Noche, tren «Visible», estación «Auto (cerca / arriba)»
- URL compartible: vista, cámara (objetivo/distancia/acimut/polar, o pos+yaw/pitch en primera persona) y ajustes completos; se restaura todo al abrir

**Vistas y manejo**
- Aérea: letreros/tubos transparentes y tren según ángulo; Caminar (andén/calle); giro de mirada en Cabina; flechas giran suave (Shift desplaza; en Cabina ←/→ mirada, ↑/↓ conductor); arrastre derecha→mira derecha, arriba→mira arriba
- Cortina de carga al cambiar de vista o saltar de nivel («Ir a…»): tapa el tirón del primer cuadro, se quita tras 2 cuadros (mín. 320 ms); cambio de vista limpio (oculta controles previos, suelta teclas, Caminar empieza en andén, Cabina mira al frente)
- En Caminar/Cabina no se desvanecen techos ni paredes (Auto solo en vistas libres)
- Cabina: manejo automático/piloto automático (activo al entrar, frena con curva suave, para exacto sin brinco —antes saltaba 24 cm—, espera abordaje, sigue sin fin); palanca de mouse; resolución adaptable ya no cambia por un pico
- Velocidad punta 80 km/h (auto y manual), estaciones a 736 m, trenes de vista libre a 60 km/h
- Línea infinita procedural: siguiente estación al fondo, ciudad distinta por tramo, trenes llegan de lejos; escaleras reales andén↔calle (también en Caminar)
- Reiniciar recorrido no reinicia a la gente (solo vuelve el tren; en cabina arranca a 220 m automático)

**Navegación e interfaz**
- Título «Metrorrey» con botón **Salir** → `/ruta` (página roadmap independiente)
- «Techos y paredes» y «Escenario» en menú ⚙ Ajustes (cierra al tocar fuera/Esc); ayuda como botón «?» (oculto en Cabina/Caminar); controles de conductor y caminar minimizados a un lado con botón para desplegar; en móvil la barra de vistas va en un renglón deslizable

**Rendimiento**
- Espejo sin CubeCamera (redibujado 1 de cada 4 cuadros), fusión de mallas fijas, instancias con recorte, sin luces puntuales de día ni en vagones, sombras cada 2 cuadros, resolución adaptable; cada persona = 1 malla (1 draw call en vez de ~11)

**Espejos**
- Colgados del techo, uno por andén (uno por metro), adelante de la cabina; reflejo solo del lado del conductor (carcasa naranja por detrás); grandes, vista convexa de las puertas; en Caminar te ves (tu cuerpo solo en espejos) y en Cabina sale el conductor

**Gente (IA y aspecto)**
- Personas generativas aleatorias (poca/mucha gente, colores/poses/alturas por ciclo); entran al vagón de verdad (no se vuelven transparentes), se sientan o se agarran de tubo; llegan por escalera, esperan junto a puerta o banca, voltean al tren, dejan bajar antes de subir (fila a los lados), los que bajan salen por escalera, corren si llegan tarde; vigilante patrulla; momento de prepararse al azar (antes, al frenar o al detenerse); puertas cierran al terminar
- Fila ordenada para bajar por puerta; peatones de frente se hacen a su derecha; la gente te rodea si estás parado; no caminan dentro de bancas/asientos; no cruzan mamparo/testero; en Caminar no los atraviesas (te desliza por el costado)
- Cabina del conductor sin gente (lugares |u|=5.25 y traseros de la fila caían tras el mamparo |x|>12.90: ya no se generan, la fila se pega al mamparo, clamp final)
- Atorados en escaleras: clamp lateral del andén dejaba inalcanzables las bocas (z 3.9 / −7.95) → carriles por sentido, llegada por cercanía/rebase en puntos intermedios, empuje de multitud topado
- Aspecto: esqueleto articulado, caminata, ropa, peinados, piel, estatura y complexión variadas; estaturas MX (~1.60 m; mujeres ~1.55, hombres ~1.64, rango 1.45–1.75); ojos en Caminar 1.49 m (1.12 sentado); tronco con forma (cintura, pecho, hombros; cadera más ancha en mujeres), cuello de prenda, cejas, boca, mandíbula; manos con palma/dedos/pulgar; muñecas, codos, rodillas redondeados; zapatos con punta y suela
- Sentarse: en Caminar te sientas al acercarte a asiento libre (banca o vagón), W/↑ te para y das un paso; llegan al frente del asiento, giran y bajan cadera con pies fijos; pies en el piso a cualquier estatura (muslo/rodilla por geometría); manos sobre muslos; falda sigue a muslos; un asiento, una persona; tu cuerpo sentado sale en el espejo
- Experimento descartado: personajes Quaternius CC0 (glTF con esqueleto): más pesados y con fallas de manos/poses; se volvió a personas sencillas

**Caminar y viajar a bordo**
- Ojos a 1.58→1.49 m; subir/bajar por puerta abierta del lado del andén (había hueco); cerca de puerta abierta te acomoda hacia ella, sin puerta resbalas por el costado (L1 y L2, ambos sentidos)
- Viaje sin fin a bordo en ambas líneas y ambos trenes de L1 (antes el tren 2 se iba fuera de escena y brincaba): no se reemplazan pasajeros por vuelta, solo cambian quienes bajan/suben y cada estación trae otra gente; al bajarte vuelve al ciclo

**Transbordo L2 (ver `transbordo-cuauhtemoc.md`)**
- Elevada renombrada Línea 1 (Talleres↔Exposición), subterránea Línea 2; L1 subida 3.5 m; 5 niveles caminables; túnel infinito L2 con 2 MM-05 y gente; vistas «Andén L2», «Viajar L2», «Corte»; gente L1 usa N2 (sur/poniente/N3); abordar y sentarse en L2
- Arreglos: hueco en terreno para escalera N3→N4, vías sin parpadeo, esquinas de cabina sanas en tren girado (chaflanes usaban `lookAt` en coordenadas del mundo)

**Antes de la lista:** MM-05 fiel a fotos (doble franja roja, logo central, M1, nariz achaflanada, interior completo visible); techos de estación y tren transparentes configurables; modo conductor con interlock de puertas; espejo convexo fijo con reflejo en vivo.
