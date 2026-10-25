# ruta.casa: instrucciones para agentes

<!-- flujo-pc:inicio -->
## Flujo PC: probar, compilar y desplegar

Se trabaja en la **PC Debian «computadora»** (usuario `dev`, consolas de Sistemas › Desarrollo), no en la Mac.
Antes de tocar nada lee la guía ~/git/Personal/sistema.fernandodilland/docs/desarrollo/FLUJO.md (§3: reglas para el LLM) y, si existe,
`~/dev/registros/ruta.casa/ULTIMO.md` (lo último que se probó, compiló o desplegó y qué falló).

- **Nunca** pruebes contra productivo ni leas sus `.env`: los de la PC son locales (claves de la PC).
- **Nunca** uses scripts que entren por `ssh hivelocity` como root: son de la Mac. A productivo solo se llega con
  `desplegar-paquete`, y **solo si el dueño lo pide** en la conversación (reinicia servicios).
- Antes de desplegar: pruebas en verde, commit y push hechos y paquete **sin** `-sucio`. Si falta algo, no despliegues.
- Migraciones: solo agregan (expand → contract); lo destructivo va aparte, días después y a mano. Datos en
  transacción; el DDL de MariaDB hace commit implícito. Revertir = `desplegar-paquete revertir` (el esquema se queda).
- Si un despliegue falla, no reintentes a ciegas: lee la bitácora que imprime y repórtala.

| Paso | Cómo |
|---|---|
| Desplegar | push a `main` → Workers Builds (Worker `ruta-casa`) |

**No usar:** `npx wrangler deploy` a mano.

**Desactualizado en este repo** (manda este bloque): `README.md` dice `npx wrangler deploy`.

<!-- flujo-pc:fin -->
