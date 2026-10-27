# Transbordo subterráneo de Cuauhtémoc (L1 elevada ↔ L2 subterránea)

Estado: **construido** (23-oct-2026). L1 = Talleres ↔ Exposición (oriente +x = Exposición). L2 = Sendero/San Nicolás ↔ Gral. I. Zaragoza, cruza a 90° por debajo, desplazada de lado del viaducto.
Ejes: **+x oriente, −x poniente, +z sur, −z norte, y=0 calle**. Constantes en `js/main.js`: `LIFT`=3.5, `N2_Y`=4.9, `N3B`={x 30–46, z 18–34, top 9.0}, `AX`=42, `ZC`=22, `N4_Y`=−5, `N5_Y`=−10.5, `L2_P`=640.

## Niveles (arriba → abajo)
| Nivel | Qué es | Piso y | Huella (x · z) | Contenido / conexiones |
|---|---|---|---|---|
| N1 | andenes elevados | 11.05 | x −26…26 | 4 escaleras cortas (extremos de cada andén) atraviesan la losa hacia N2 |
| N2 | conexión bajo la estación (dentro del viaducto, techo = losa 8.4) | 4.9 | x −36…36 · z −9.4…6.6 | muros de cristal, columnas, plafón, torniquetes; salida **sur** (escalera a banqueta, x=4), **poniente** (escalera, x≈−44), **oriente** pasarela a N3 |
| Pasarela | cubierta, cristal, cruza la avenida | 4.9 | x 30.2…32.8 · z 6.6…18 | conecta N2 con N3 |
| N3 | edificio de transbordo a nivel suelo, banqueta sur | 0.6 | x 30…46 · z 18…34 | rellano+escalera de pasarela, torniquetes, puerta con rampa a banqueta, pozo de escalera a N4 |
| N4 | distribuidor subterráneo | −5.0 | x 32.3…51.7 · z 11…31.5 | escalera a cada andén de L2, puerta del andén de servicio |
| N5 | andenes L2: 2 laterales + 1 central de servicio | −10.5 | eje L2 x=42, andenes z −2…46; vías x 39 y 45 | andén Zaragoza (poniente), servicio, andén Sendero (oriente) |
| Túnel | L2 | piso −12 | x 35.5…48.5, z ±960 | catenaria rígida, lámparas cada 16 m, andador de evacuación |

Ruta del transbordo: tren elevado → escalera corta N2 → oriente, pasarela → N3 (sin salir a la calle) → N4 → escalera del andén L2 deseado.
Altura: toda la L1 sube `LIFT` (tablero 9.5, andén 11.05); N2 ≈4.5 m libres sobre la avenida.

## Comportamiento
- Línea infinita: N2 está en el tramo periódico (cada estación elevada); N3–N5 solo en la estación central (donde siempre estás). L2 tiene su propio túnel infinito que se repite cada 640 m (copias a ±640 m; los trenes se reciclan a medio túnel).
- Bajo tierra cambian luz y niebla; la superficie no se dibuja. Arriba lo subterráneo solo se dibuja cerca del pozo de N3 o en la vista **Corte**.
- Trenes L2: dos MM-05 con ciclo propio (llegan, abren, esperan a que termine el abordaje, cierran, salen); viaje sin fin; a medio túnel cambia la gente del andén.
- Vistas: **Andén L2**, **Viajar L2** (cabina a Sendero), **Corte** (sin calle/suelo/ciudad; la más pesada: ~5 ms, ~1000 draw calls). **Caminar › Ir a…** salta entre andenes L1, conexión, calle sur, N3, N4, andenes L2.
- Abordar caminando (L1 y L2): puerta abierta → entras, te sientas en asiento libre, viajas sin fin; cerca de una puerta abierta te acomoda hacia ella; en el tren el cálculo de caminar va en coordenadas del tren (a lo largo de z).
- Gente L1: entra/sale por salida sur, poniente o N3 (pasarela). Gente L2: bajan algunos (escalera→N4→N3→calle), suben los que esperaban, llega gente nueva de la calle.

## Pendiente
- [ ] Transbordo de gente N1 ↔ N5 (la gente de L1 sale por N3 a la calle, no baja a L2).
- [ ] Filas en torniquetes y escaleras.
- [ ] Escaleras eléctricas o elevador, si los hay.
- [ ] Ajustes › «Techos y paredes» para el edificio N3.
- [ ] Aligerar «Corte» ocultando la ciudad lejana.

## Por confirmar con fotos o visitas
Número/posición de escaleras N1→N2 (hoy 2 por andén, en los extremos) · distancia real y lado del edificio N3 · si el andén central N5 es solo de servicio · escaleras eléctricas/elevador · sentido real (¿Exposición al oriente?) · colores y acabados N3–N5 (fotos a `visual-plan/refs/`).
