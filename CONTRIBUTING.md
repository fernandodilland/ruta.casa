# Guía para colaborar en ruta.casa

Todo el texto del repositorio (docs, issues, PR, commits) va **en español**. Convenciones de código, verificación y
decisiones de diseño: [`AGENTS.md`](AGENTS.md) (sección «Proyecto»); no se repiten aquí.

## Formas de colaborar
- 🐞 Reportar errores (plantilla «Reporte de error»: qué esperabas/qué pasó, vista, escenario, minutos corriendo, navegador/SO, captura o video).
- 💡 Proponer mejoras: revisa antes la [hoja de ruta](README.md#-hoja-de-ruta-roadmap) y [`pendientes.md`](pendientes.md).
- 📷 Fotos de referencia: solo dominio público, CC BY / CC BY-SA o tuyas donadas; indica autor y licencia (van a `visual-plan/refs/`, no se relicencian como MIT).
- 📝 Documentación: correcciones, términos, descripciones de estaciones.
- 💻 Código y modelado 3D en `js/main.js`.

## Pull request
1. Fork y clon: `git clone https://github.com/TU-USUARIO/ruta.casa.git`.
2. Rama descriptiva: `git checkout -b estaciones/linea-1-oriente` (o `correccion/…`, `docs/…`).
3. Cambia y prueba (sin build): doble clic en `index.html` (`file://`) o `python3 -m http.server 8123 --bind 127.0.0.1`.
4. Antes de abrir el PR: `node --check js/main.js`; sin errores de consola; vistas tocadas probadas (Andén, Interior, Cabina, Caminar, Línea 2…); simulación varios minutos sin atorones; sigue abriendo con `file://`; capturas si es visual.
5. PR contra `main` con la plantilla. Si completas una tarea de `pendientes.md`, táchala ahí.

Commits cortos, en español, imperativo o descriptivos (`Corrige atorados en las bocas de escalera del andén`).

Al participar aceptas el [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) y que tu aportación se publique bajo la licencia MIT del proyecto ([`LICENSE`](LICENSE)), conservando tu autoría en Git.
