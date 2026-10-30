# HoopOS · Club Atlético Monte Grande

HoopOS es el sistema de básquet del Club Atlético Monte Grande: gestiona divisiones, planteles y calendario, arma convocatorias y quintetos, y registra los partidos en vivo con reglas FIBA desde una tablet al borde de la cancha. Funciona sin conexión: todo se guarda en el navegador (Zustand + `localStorage`) y el marcador, las faltas y el box score se derivan del jugada a jugada. La sincronización con un servidor está en desarrollo.

Manual completo (uso, reglas, datos y arquitectura): [docs/MANUAL.md](docs/MANUAL.md).

## Inicio rápido

Requisito: Node.js 20.9 o superior (se recomienda la LTS vigente).

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000`. La primera carga crea los datos de demostración del club en el navegador.

## Scripts

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` | Compilación de producción. |
| `npm run start` | Sirve la compilación de producción. |
| `npm run lint` | ESLint (configuración de Next.js). |
| `npm test` | Pruebas unitarias del núcleo (`node:test` vía `tsx`). |

## Stack

| Área | Tecnología |
|------|------------|
| Framework | Next.js 16 (App Router), React 19, TypeScript estricto |
| Estado y persistencia | Zustand con `persist` sobre `localStorage` |
| Formularios y validación | react-hook-form + Zod |
| Estilos | CSS Modules + tokens CSS en `src/app/globals.css` |
| Animación | GSAP + `@gsap/react` (respeta `prefers-reduced-motion`) |
| Iconos | lucide-react |
| Tipografía | Archivo y Archivo Narrow (`next/font`) |
| Pruebas | `node:test` + `tsx` |

`@tanstack/react-query` está instalada pero todavía no se usa; está prevista para la sincronización con el servidor.

## Estructura del proyecto

```text
src/
  app/                    rutas (App Router)
  core/
    domain/               entidades, esquemas Zod y reglas FIBA puras
    application/          casos de uso, store Zustand y hooks
    infrastructure/mocks/ datos de demostración determinísticos
  presentation/           atoms, molecules, organisms, templates, motion
docs/MANUAL.md            manual del sistema
```

Las dependencias apuntan hacia adentro: la presentación usa aplicación y dominio; el dominio no depende de nada. Detalle en la sección Arquitectura del manual.

## Controles de calidad

Antes de integrar cambios, los cuatro deben pasar:

- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
