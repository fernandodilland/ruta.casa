# Estación subterránea de transbordo

Plan para construir el transbordo de **Cuauhtémoc**: la estación elevada
actual (**Línea 1, Talleres ↔ Exposición**) se conecta por dentro con la
**Línea 2 subterránea** (San Nicolás/Sendero ↔ Gral. I. Zaragoza), que cruza a
**90°** por debajo y queda **ligeramente a un lado** (no exactamente bajo
el viaducto) para que quepa la estructura de conexión.

Estado: **construida** (23-oct-2026). Se puede caminar por los 5
niveles, abordar los trenes MM-05 de la Línea 2 y viajar en ellos por un
túnel infinito; su gente sube, baja y llega desde la calle. Lo que falta
está en la sección 5.

---

## 1. Cómo es el transbordo (descripción a respetar)

Son **5 niveles**, de arriba hacia abajo:

| Nivel | Qué es | Conecta con |
|---|---|---|
| **N1** | Andenes elevados (la estación actual) | Escaleras cortas hacia N2 |
| **N2** | **Conexión bajo la estación**: piso inferior inmediato, dentro de la estructura del metro, debajo de los andenes | **Sur**: 1 escalera a la calle · **Poniente**: 1 escalera a la calle · **Oriente**: escaleras internas hacia N3 |
| **N3** | **Edificio de transbordo** cuadrado a **nivel suelo**, junto a la banqueta, a un lado y no sobre la avenida | Salida propia a la calle · escaleras hacia N4 |
| **N4** | **Distribuidor subterráneo**: mini piso intermedio | Escaleras a cada andén de N5 |
| **N5** | **Andenes subterráneos de L2**: 3 andenes (2 laterales y 1 central de servicio) | Lateral rumbo **San Nicolás** (norte) · lateral rumbo **Zaragoza** (sur) |

Recorrido de quien transborda: baja del tren elevado → escalera corta a
N2 → por el oriente, escaleras internas al edificio N3 (sin salir a la
calle) → escaleras a N4 → escalera del andén que le toca en N5.

```
 Corte (mirando al norte; oriente a la derecha)

 N1  ══════ andenes elevados ══════
          │ escalera corta
 N2  ───── conexión bajo la estación ─────────┐ escaleras internas
     │sur→calle   │poniente→calle              │ (oriente)
 ─calle/avenida───────────────────── banqueta ┌┴──────────────┐
                                         N3   │ edificio      │→ salida a calle
                                              │ transbordo    │
 ════ suelo ════════════════════════════════  └──────┬────────┘
                                         N4      distribuidor
                                              ┌──────┴────────┐
                                         N5   │ andén │serv.│ andén │  L2 (cruza a 90°)
                                              └───────────────┘
```

---

## 2. Decisiones tomadas

1. **Líneas.** La elevada es la **Línea 1 (Talleres ↔ Exposición)**:
   oriente (+x) = Exposición, poniente (−x) = Talleres. La subterránea es
   la **Línea 2** (Sendero / San Nicolás ↔ Gral. I. Zaragoza). Letreros,
   pantallas LED, panel de estado y destinos de los trenes ya dicen eso.
2. **Altura.** Toda la línea elevada subió **3.5 m** (`LIFT`): tablero a
   9.5 m, andén a 11.05 m. N2 tiene su piso a 4.9 m (≈4.5 m libres sobre
   la avenida) y su techo es la losa del viaducto (8.4 m).
3. **Edificio N3** al **oriente y al sur** de la avenida, junto a la
   banqueta sur.
4. **Línea infinita.** N2 va en el tramo periódico (cada estación elevada
   la tiene). N3, N4 y N5 existen en la estación central, que es donde
   siempre estás (el tramo se recicla). La Línea 2 tiene su propio túnel
   infinito.
5. **Trenes de L2.** Dos MM-05 con ciclo propio: llegan, abren, esperan,
   cierran y salen al túnel; dan la vuelta sin fin.

---

## 3. Cómo quedó (coordenadas del código)

**+x = oriente**, **−x = poniente**, **+z = sur**, **−z = norte**,
**y = 0 calle**. Constantes en `js/main.js`: `LIFT`, `N2_Y`, `N3B`, `AX`,
`ZC`, `N4_Y`, `N5_Y`, `L2_P`.

| Nivel | Piso (y) | Huella (x · z) | Qué tiene |
|---|---|---|---|
| N1 | 11.05 | x −26…26 | 4 escaleras cortas (una en cada extremo de cada andén) bajan atravesando la losa |
| N2 | 4.9 | x −36…36 · z −9.4…6.6 | Muros de cristal, columnas del viaducto, luz de plafón, torniquetes, salida **sur** (escalera a la banqueta sur, x = 4), salida **poniente** (escalera al suelo, x ≈ −44) y pasarela al **oriente** (x 30.2…32.8) |
| Pasarela | 4.9 | x 30.2…32.8 · z 6.6…18 | Cubierta y de cristal, cruza sobre la avenida |
| N3 | 0.6 | x 30…46 · z 18…34 | Rellano de la pasarela + escalera, torniquetes, puerta con rampa a la banqueta, pozo de escalera a N4 |
| N4 | −5.0 | x 32.3…51.7 · z 11…31.5 | Distribuidor: escalera a cada andén de L2, puerta del andén de servicio |
| N5 | −10.5 | eje L2 en x = 42, andenes z −2…46 | Andén Zaragoza (poniente), andén central de servicio, andén Sendero (oriente); vías en x 39 y 45 |
| Túnel | −12 (piso) | x 35.5…48.5, z ±960 desde la estación | Catenaria rígida, lámparas cada 16 m, andador de evacuación |

- El túnel se repite cada **640 m** (`L2_P`): hay copias de la estación a
  ±640 m y los trenes se reciclan a medio túnel sin que se note.
- Bajo tierra cambian la luz y la niebla, y lo de la superficie no se
  dibuja. Arriba, lo subterráneo solo se dibuja cerca del pozo de N3 o en
  la vista **Corte**.

## 4. Cómo se usa

- **Andén L2**: vista del andén subterráneo (la cámara no sale del cajón).
- **Viajar L2**: en la cabina del tren a Sendero, sin fin; arrastra para
  mirar. A medio túnel cambia la gente del andén.
- **Corte**: se quitan calle, suelo y ciudad para ver los 5 niveles.
- **Caminar** → **Ir a…**: andenes L1, conexión, calle sur, edificio de
  transbordo, distribuidor y andenes L2. Se puede caminar de un nivel a
  otro por las escaleras.
- **Abordar la Línea 2 caminando**: con puertas abiertas entras al tren,
  te puedes sentar en un asiento libre y viajas sin fin; en cada llegada
  abre y puedes bajar al andén. Dentro del tren, lo de caminar se calcula
  en coordenadas del tren (va a lo largo de z), igual que en la Línea 1.
  Cerca de una puerta abierta te acomoda hacia ella (no hay que atinarle
  exacto). En la Línea 1 también se viaja sin fin en ambos sentidos.
- **Gente de la Línea 2**: al abrir puertas bajan algunos (van por la
  escalera, el distribuidor y N3 a la calle) y suben los que esperaban
  cerca; el tren espera a que terminen. De la calle llega gente nueva a
  esperar en los andenes.
- La gente de la Línea 1 entra y sale por la salida sur, la poniente o
  por el edificio de transbordo (cruzando la pasarela).

---

## 5. Pendiente

- [x] Subir y bajar del tren de la Línea 2 caminando, sentarse y viajar
- [x] Gente de la Línea 2 que baja, sube y llega desde la calle
- [ ] Transbordo de gente N1 ↔ N5 (hoy la gente de la Línea 1 sale a la
      calle por N3, pero no baja a la Línea 2)
- [ ] Filas en torniquetes y escaleras.
- [ ] Escaleras eléctricas o elevador, si los hay.
- [ ] Ajustes → «Techos y paredes» para el edificio N3.
- [ ] «Corte» es la vista más pesada (~5 ms, ~1000 llamadas de dibujo):
      se puede aligerar ocultando la ciudad lejana.

## 6. Datos por confirmar con fotos o visitas
- Número y posición exacta de las escaleras N1→N2 (hoy: dos por andén,
  en los extremos).
- Distancia real del edificio N3 a la estación elevada y su lado.
- Si el andén central de N5 es solo de servicio o también se usa en
  algunas horas.
- Escaleras eléctricas o elevador en algún tramo.
- Sentido real: ¿Exposición al oriente y Talleres al poniente?
- Colores y acabados de N3 a N5 (agregar fotos a `visual-plan/refs/`).
