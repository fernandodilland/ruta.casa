# Guía para colaborar en ruta.casa

¡Gracias por tu interés en **ruta.casa**! Este documento explica cómo
aportar al proyecto. Todo el texto del repositorio (documentación,
issues y pull requests) se maneja **en español**.

## Formas de colaborar

No todo es código. También nos ayuda muchísimo:

- 🐞 **Reportar errores**: algo se ve mal, alguien se atora, un texto
  está equivocado… abre un *issue* con la plantilla de error.
- 💡 **Proponer mejoras**: una estación, un detalle del tren, una vista
  nueva. Revisa antes la [hoja de ruta](README.md#-hoja-de-ruta-roadmap)
  y [`pendientes.md`](pendientes.md) por si ya está contemplado.
- 📷 **Fotos de referencia**: de trenes, estaciones e interiores. Solo
  material con licencia compatible (dominio público, CC BY / CC BY-SA, o
  fotos tuyas que quieras donar), indicando autor y licencia.
- 📝 **Documentación**: correcciones, traducciones de términos,
  descripciones de estaciones y sistemas.
- 💻 **Código y modelado 3D**: la escena vive en `js/main.js` (abajo van
  las convenciones).

## Cómo proponer un cambio (pull request)

1. Haz un **fork** del repositorio y clónalo:

   ```sh
   git clone https://github.com/TU-USUARIO/ruta.casa.git
   cd ruta.casa
   ```

2. Crea una rama descriptiva:

   ```sh
   git checkout -b estaciones/linea-1-oriente
   # o bien: correccion/gente-escaleras, docs/readme-cdmx…
   ```

3. Haz tu cambio **y pruébalo** (siguiente sección).
4. Sube tu rama y abre un **pull request** contra `main`, llenando la
   plantilla (qué cambia, cómo lo probaste, capturas si es visual).
5. Espera la revisión: puede haber comentarios o peticiones de ajuste.
   Sin prisas, es un proyecto de aficionados. 🙂

## Cómo ejecutar y probar tu cambio

El proyecto **no tiene build ni dependencias que instalar**:

```sh
# Opción 1: doble clic en index.html (funciona con file://)
# Opción 2: servidor local
python3 -m http.server 8123 --bind 127.0.0.1
# entra a http://127.0.0.1:8123/
```

Antes de abrir el pull request, por favor verifica:

- [ ] `node --check js/main.js` pasa sin errores de sintaxis.
- [ ] La página carga sin errores en la consola del navegador.
- [ ] Probaste las vistas que toca tu cambio (Andén, Interior, Cabina,
      Caminar, Línea 2…) y la simulación sigue corriendo tras varios
      minutos (la gente no se atora, el tren completa su ciclo).
- [ ] Si el cambio es visual, adjunta **capturas** en el pull request.
- [ ] El archivo sigue abriendo con `file://` (sin servidor).

## Convenciones del código

La escena completa está en **un solo archivo**, `js/main.js`, en
JavaScript clásico. Para no romper el «doble clic y funciona»:

- **Sin módulos ES, sin import, sin CDN y sin paso de compilación.**
  Three.js se usa desde `lib/three.min.js` (r128) como variable global.
- **Sin recursos externos**: las texturas se dibujan en código (canvas);
  no agregues imágenes que la página cargue en tiempo de ejecución.
- **Comentarios en español** y breves: que expliquen el *porqué*, no el
  *qué*. El código existente ya sigue ese estilo; imítalo.
- Estilo actual: `var`, funciones declaradas, indentación de 2 espacios,
  llaves en la misma línea. No reformatees todo el archivo: los diffs
  pequeños se revisan mejor.
- **Rendimiento primero**: lo fijo se fusiona (`mergeStatic`), lo
  repetido se instancia y cada persona es una sola malla. Si tu cambio
  agrega geometría o luces, piensa cuánto cuesta por cuadro.
- **Fidelidad con referencias**: el modelo sigue fotos reales (en
  `visual-plan/refs/`). Si copias un detalle de una foto nueva, guárdala
  ahí con su fuente y licencia, y anota el porqué en
  [`visual-plan/PRD-MM05.md`](visual-plan/PRD-MM05.md) o en el PRD de tu
  sistema.
- La bitácora de pendientes vive en [`pendientes.md`](pendientes.md):
  si tu cambio completa una tarea, táchala ahí (`- [x]`).

## Mensajes de commit

En español, cortos y en imperativo o descriptivos, por ejemplo:

```
Corrige atorados en las bocas de escalera del andén
Agrega gotas de lluvia en vidrios del tren
Documenta roadmap del Metro de la CDMX por línea
```

## Reportar un error

Usa la plantilla «Reporte de error» e incluye, si puedes:

- Qué esperabas que pasara y qué pasó.
- Vista y escenario (Andén/Cabina/…, día/noche/lluvia).
- Cuánto tiempo llevaba corriendo la simulación.
- Navegador y sistema operativo, y una captura o video.

## Código de conducta

Al participar aceptas el [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md):
respeto, buena fe y nada de acoso. Queremos que cualquiera que le
gusten los trenes se sienta bienvenido.

## Licencia de tus aportaciones

Al enviar un pull request aceptas que tu aportación se publique bajo la
**licencia MIT** del proyecto (ver [`LICENSE`](LICENSE)), conservando tu
autoría en el historial de Git. Las fotos que aportes deben tener una
licencia compatible y quedarán acreditadas a su autor; no se
relicencian como MIT.
