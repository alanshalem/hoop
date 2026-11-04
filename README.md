# Hoop · Club Atlético Monte Grande

Hoop es el sistema de básquet del Club Atlético Monte Grande: gestiona divisiones, planteles y calendario, arma convocatorias y quintetos, y registra los partidos en vivo con reglas FIBA desde una tablet al borde de la cancha. Su núcleo es la planilla táctica del entrenador, que se carga en vivo durante el partido: pérdidas, puntos recibidos, acciones ofensivas y defensivas, cada una con su jugador, período y reloj ([manual](docs/MANUAL.md#2-planilla-táctica-en-vivo)). Es local primero con servidor: cada cambio se guarda al instante en el navegador (Zustand + `localStorage`) y se sincroniza con PostgreSQL cuando hay conexión (cola de salida persistente, last-write-wins para registros, jugadas solo agregadas y avisos en vivo por SSE). Sin conexión sigue funcionando igual. El acceso es con correo y contraseña, y los roles se validan en el servidor. El marcador, las faltas y el box score se derivan del jugada a jugada.

Manual completo (uso, reglas, datos y arquitectura): [docs/MANUAL.md](docs/MANUAL.md).

## Inicio rápido

Requisitos: Node.js 20.9 o superior (se recomienda la LTS vigente) y Docker con Docker Compose.

```bash
npm install
# Crear .env.local a partir de .env.example (los valores por defecto sirven para desarrollo)
npm run db:up        # PostgreSQL 17 en Docker
npm run db:migrate   # tablas
npm run db:seed      # club de demostración y cuentas (solo inserta lo que falta)
npm run dev
```

`db:seed` carga datos de demostración para desarrollo y pruebas. Para los datos reales del club se usa `db:import-actas` (ver [Datos reales: actas oficiales](#datos-reales-actas-oficiales)), que reemplaza todo lo anterior.

Abrir `http://localhost:3000` e iniciar sesión, por ejemplo con `admin@camg.com.ar` y la contraseña de demostración `camg1922` (variable `SEED_DEMO_PASSWORD`). Cuentas por rol, variables de entorno (`DATABASE_URL`, `TEST_DATABASE_URL`, `POSTGRES_*`, `SESSION_COOKIE_SECURE`) y solución de problemas: [sección Servidor y base de datos del manual](docs/MANUAL.md#9-servidor-y-base-de-datos).

> Tablets en la red del club con una compilación de producción por `http`: definir `SESSION_COOKIE_SECURE=false`, o el navegador descarta la cookie de sesión.

## Scripts

| Comando                             | Qué hace                                                                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                       | Servidor de desarrollo.                                                                                                                                        |
| `npm run build`                     | Compilación de producción.                                                                                                                                     |
| `npm run start`                     | Sirve la compilación de producción.                                                                                                                            |
| `npm run lint`                      | ESLint (configuración de Next.js).                                                                                                                             |
| `npm test`                          | Pruebas unitarias (`node:test` vía `tsx`), sin base de datos.                                                                                                  |
| `npm run test:db`                   | Pruebas de integración contra PostgreSQL (base `_test` aparte).                                                                                                |
| `npm run db:up` / `npm run db:down` | Levanta o detiene PostgreSQL en Docker.                                                                                                                        |
| `npm run db:migrate`                | Aplica las migraciones de `drizzle/`.                                                                                                                          |
| `npm run db:seed`                   | Carga el club de demostración y las cuentas (desarrollo y pruebas). Nunca sobrescribe datos del club, pero restablece las cuentas de demostración (nombre, correo, rol y contraseña). |
| `npm run db:import-actas`           | Reemplaza todos los datos por los de las actas oficiales (ver abajo). Con `--dry-run` solo valida y muestra el resumen.                                          |

### Datos reales: actas oficiales

```bash
npm run db:import-actas -- --csv <planilla.csv> --pdfs <carpeta> --dry-run   # valida y muestra el resumen, sin conectarse a la base
npm run db:import-actas -- --csv <planilla.csv> --pdfs <carpeta> --yes       # borra y carga
```

- `--csv`: planilla extraída de las actas (separada por `;`, UTF-8), una fila por jugador anotado en cada partido.
- `--pdfs`: carpeta con los `Acta-Partido-<número>.pdf`; de cada acta se leen el tanteo final y los puntos por cuarto con `pdftotext -layout` (Poppler). Otra ruta del ejecutable: `--pdftotext <ruta>` o la variable `PDFTOTEXT`.
- En una sola transacción borra todos los registros, jugadas, sesiones y cuentas excepto `admin@camg.com.ar` (su contraseña no cambia; si la cuenta no existe, no se modifica nada), cambia la época de datos del servidor y carga la división, el equipo propio con sus jugadores y entrenadores, los rivales con sus planteles y los partidos finalizados con su resultado oficial. Los navegadores con datos o cambios anteriores los descartan y recargan desde el servidor; no pueden volver a subirlos.
- La importación falla con la lista completa de problemas si un acta no coincide con la planilla (equipos, tanteo final o cuartos que no suman el final). El resumen informa los dorsales repetidos del equipo propio, los dorsales rivales reasignados (deben ser únicos por equipo) y los nombres completados desde el acta.
- Las actas y la planilla tienen datos personales: no se guardan en el repositorio.

## Stack

| Área                        | Tecnología                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Framework                   | Next.js 16 (App Router), React 19, TypeScript estricto                                                       |
| Estado y persistencia local | Zustand con `persist` sobre `localStorage` (club, cola de sincronización, perfil)                            |
| Servidor                    | Route Handlers de Next.js, PostgreSQL 17 (Docker), Drizzle ORM + `pg`, sesiones con cookie httpOnly y scrypt |
| Sincronización              | Outbox persistente, `fetch` + Server-Sent Events, respuestas validadas con Zod                               |
| Formularios y validación    | react-hook-form + Zod                                                                                        |
| Estilos                     | CSS Modules + tokens CSS en `src/app/globals.css`                                                            |
| Animación                   | GSAP + `@gsap/react` (respeta `prefers-reduced-motion`)                                                      |
| Iconos                      | lucide-react                                                                                                 |
| Tipografía                  | Archivo y Archivo Narrow (`next/font`)                                                                       |
| Pruebas                     | `node:test` + `tsx`                                                                                          |

`@tanstack/react-query` está instalada pero no se usa: la sincronización tiene su propio motor (`src/core/application/sync/`).

## Estructura del proyecto

```text
src/
  app/                    rutas (App Router)
  core/
    domain/               entidades, esquemas Zod y reglas FIBA puras
    application/          casos de uso, stores Zustand, hooks, motor de sincronización
    infrastructure/       datos de demostración y adaptadores HTTP/SSE de la API
  presentation/           atoms, molecules, organisms, templates, motion, session
  server/                 base de datos, autenticación, RBAC y sincronización (server-only)
drizzle/                  migraciones SQL
docker-compose.yml        PostgreSQL de desarrollo
docs/MANUAL.md            manual del sistema
```

Las dependencias apuntan hacia adentro: la presentación usa aplicación y dominio; el dominio no depende de nada. Detalle en la sección Arquitectura del manual.

## Controles de calidad

Antes de integrar cambios, los cuatro deben pasar:

- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
