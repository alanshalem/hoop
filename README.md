# HoopOS · Club Atlético Monte Grande

HoopOS es el sistema de básquet del Club Atlético Monte Grande: gestiona divisiones, planteles y calendario, arma convocatorias y quintetos, y registra los partidos en vivo con reglas FIBA desde una tablet al borde de la cancha. Es local primero con servidor: cada cambio se guarda al instante en el navegador (Zustand + `localStorage`) y se sincroniza con PostgreSQL cuando hay conexión (cola de salida persistente, last-write-wins para registros, jugadas solo agregadas y avisos en vivo por SSE). Sin conexión sigue funcionando igual. El acceso es con correo y contraseña, y los roles se validan en el servidor. El marcador, las faltas y el box score se derivan del jugada a jugada.

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

Abrir `http://localhost:3000` e iniciar sesión, por ejemplo con `admin@camg.com.ar` y la contraseña de demostración `camg1922` (variable `SEED_DEMO_PASSWORD`). Cuentas por rol, variables de entorno (`DATABASE_URL`, `TEST_DATABASE_URL`, `POSTGRES_*`, `SESSION_COOKIE_SECURE`) y solución de problemas: [sección Servidor y base de datos del manual](docs/MANUAL.md#8-servidor-y-base-de-datos).

> Tablets en la red del club con una compilación de producción por `http`: definir `SESSION_COOKIE_SECURE=false`, o el navegador descarta la cookie de sesión.

## Scripts

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` | Compilación de producción. |
| `npm run start` | Sirve la compilación de producción. |
| `npm run lint` | ESLint (configuración de Next.js). |
| `npm test` | Pruebas unitarias (`node:test` vía `tsx`), sin base de datos. |
| `npm run test:db` | Pruebas de integración contra PostgreSQL (base `_test` aparte). |
| `npm run db:up` / `npm run db:down` | Levanta o detiene PostgreSQL en Docker. |
| `npm run db:migrate` | Aplica las migraciones de `drizzle/`. |
| `npm run db:seed` | Carga el club de demostración y las cuentas; nunca sobrescribe datos existentes. |

## Stack

| Área | Tecnología |
|------|------------|
| Framework | Next.js 16 (App Router), React 19, TypeScript estricto |
| Estado y persistencia local | Zustand con `persist` sobre `localStorage` (club, cola de sincronización, perfil) |
| Servidor | Route Handlers de Next.js, PostgreSQL 17 (Docker), Drizzle ORM + `pg`, sesiones con cookie httpOnly y scrypt |
| Sincronización | Outbox persistente, `fetch` + Server-Sent Events, respuestas validadas con Zod |
| Formularios y validación | react-hook-form + Zod |
| Estilos | CSS Modules + tokens CSS en `src/app/globals.css` |
| Animación | GSAP + `@gsap/react` (respeta `prefers-reduced-motion`) |
| Iconos | lucide-react |
| Tipografía | Archivo y Archivo Narrow (`next/font`) |
| Pruebas | `node:test` + `tsx` |

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
