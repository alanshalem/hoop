# NOTAS DE DECISIÓN Y SEGUIMIENTO - HOOP OS

## Fase 1: Cimientos, Design System CSS y Dominio de Básquet
- **Decisión de Tokens**: Implementación de tema Arena Dark por defecto con acentos FIBA (`#0B0F17`, `#161F30`, `#FF6B00`, `#10B981`, `#EF4444`, `#F59E0B`). Soporte de tema claro vía `[data-theme='light']`.
- **Reglas FIBA**:
  - PIR calculado según estándar oficial FIBA: `(PTS + REB + AST + STL + BLK) - (Missed FG + Missed FT + TOV + Total Fouls)`.
  - Exclusión a las 5 faltas acumuladas (Art. 40 FIBA).
  - Bonus al alcanzar 4 faltas de equipo en el cuarto (Art. 41 FIBA).
  - Plus/Minus computado analizando quinteto en cancha y cronología de sustituciones.
- **Tests**: 12/12 tests unitarios pasando en `src/core/domain/rules/basketball-rules.test.ts`.

## Fase 2: Biblioteca de Componentes Atómicos y AppShell para Tablet/Mobile
- **Área táctil mínima**: Todos los botones e interacciones respetan un mínimo de 48px (`--touch-min`) y 56px (`--touch-lg`).
- **Atoms**: `TouchButton` (con GSAP spring/scale), `JerseyBadge` (con estados onCourt, bench, foulWarning, fouledOut), `FoulDots` (con pulsación en 5ta falta), `StatBadge` (con colores por posición FIBA), `StatusPill`.
- **Molecules**: `PlayerCard` (tarjeta ergonómica de toque rápido), `ModalSheet` (bottom-sheet en móvil / modal centrado en tablet con GSAP timeline).
- **Templates**: `TabletAppShell` con Navigation Rail lateral para tablets y Bottom Navigation Bar fija en la zona del pulgar para smartphones. Selector de roles reactivo simulando RBAC.

## Fase 3: Stores Persistentes, Datos Semilla de Básquet y Gestión de Club
- **Persistencia con Zustand**: Implementado `useClubStore` persistido en `localStorage` con middleware `persist`.
- **Datos Semilla (Seed Data)**:
  - 3 Divisiones: Primera División, Sub-19 (U19) y Sub-17 (U17).
  - 12 Jugadores de Primera División con posiciones reales FIBA (PG, SG, SF, PF, C), dorsales oficiales y características físicas (1.82m a 2.08m).
  - Juveniles Sub-19 y Sub-17 disponibles para convocatorias.
  - 3 Partidos en calendario: 1 finalizado (con historial play-by-play), 1 EN VIVO hoy (`match-live-today`), y 1 programado.
- **Módulos de Gestión**:
  - `/divisions`: Grilla táctil de divisiones, planteles y asignación de cuerpo técnico.
  - `/players`: Filtros rápidos por toque (división, posición, estado físico), buscador instantáneo, formulario `PlayerFormModal` con `react-hook-form` + `zod`, y acción para convocar juveniles al plantel superior.
  - `UserRoleSwitcher`: Simulación de inicio de sesión y cambio rápido de roles RBAC (Entrenador, Planillero, Administrador).
