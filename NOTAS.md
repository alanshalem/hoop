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

## Fase 4: Dashboard del Entrenador, Gestión de Fechas y Quinteto Inicial

- **Dashboard Principal (`/`)**:
  - Hero Card de partido en vivo con marcador dinámico y botón táctil destacado "ABRIR CONSOLA EN VIVO".
  - KPIs en tiempo real (récord de temporada, puntos a favor/en contra, efectividad).
  - Líderes estadísticos (PPG, RPG, APG, PIR) y alertas de jugadores lesionados.
  - Animación de entrada GSAP escalonada (`stagger`).
- **Calendario y Fechas (`/matches`)**:
  - Filtro por estado (En Juego, Programados, Finalizados).
  - Formulario de creación de fecha en `ModalSheet`.
  - Accesos rápidos a Quinteto Inicial, Consola Live y Estadísticas Box Score.
- **Armado de Convocatoria y Quinteto (`/matches/[id]/lineup`)**:
  - Selección táctil de 10 a 12 convocados en planilla según normativa FIBA.
  - Marcado de los 5 titulares (Starting Five).
  - Validación visual estricta: sólo habilita "Iniciar Partido en Vivo" cuando hay exactamente 5 titulares en cancha.

## Fase 5: Consola "Live Match Day" en Cancha (Tablet Touch-First)

- **Viewport táctil**: 100% de la altura de pantalla (`100dvh`), sin scroll vertical general.
- **ScoreboardHeader**:
  - Marcador electrónico Local vs Rival con animación de rebote GSAP en cambios de tanteador.
  - Selector de cuartos (`Q1` a `OT1`) y cronómetro integrado con Play/Pausa.
  - 4 luces indicadoras de faltas de equipo por cuarto con activación del indicador luminoso **BONUS** (Art. 41 FIBA).
  - Botones rápidos para sumar puntos al Rival (`+1`, `+2`, `+3`) y control de tiempos muertos.
- **OnCourtLineup**:
  - Columna izquierda con los 5 jugadores en cancha y 7 en banca.
  - Flujo de sustitución en 2 toques con feedback animado en GSAP.
- **HalfCourtShotChart**:
  - Media cancha reglamentaria dibujada en SVG con geometría FIBA (arco de triple a 6.75m, zona pintada y tiro libre).
  - Detección automática por geometría entre tiros de 2P y 3P.
  - Micro-selector radial en el punto de contacto (`¡ADENTRO!` vs `FALLO`).
  - Timeline de las últimas 5 jugadas con botón de un toque **DESHACER (Undo)** para corrección instantánea.
- **QuickActionPad**:
  - Columna derecha con teclado ergonómico de 56px (`--touch-lg`).
  - Botones de tiros convertidos/fallados, rebotes ofensivos/defensivos, asistencias, robos, bloqueos y pérdidas.
  - Alerta inmediata de exclusión reglamentaria (5ta falta personal/técnica) con bloqueo de acciones y requerimiento de cambio forzoso.

## Fase 6: Planilla Estadística Post-Partido (Box Score FIBA), Shot Chart Analítico y Build

- **Box Score Oficial FIBA (`BoxScoreTable`)**:
  - Tabla completa con scroll horizontal y columna de jugador fija (`sticky`).
  - Métricas: `Dorsal`, `Jugador`, `PTS`, `T2 (C/I y %)`, `T3 (C/I y %)`, `TL (C/I y %)`, `TC (C/I y %)`, `REB (O-D-TOT)`, `AST`, `STL`, `BLK`, `TOV`, `PF` (Faltas), `+/-` y `VAL (PIR)`.
  - Fila final con totales acumulados y porcentajes de equipo.
- **Shot Chart Analítico**:
  - Filtro por cuarto (`Q1` a `Q4`) y por jugador individual.
  - Cálculo automático de efectividad por zona (T2, T3 y TC).
- **Comparativa de Parciales**:
  - Desglose por cuartos (`Q1`, `Q2`, `Q3`, `Q4`, `FINAL`) para Local y Visitante.
- **Auditoría de Calidad y Verificación de Build**:
  - `npx tsc --noEmit`: 0 errores de TypeScript (`strict: true`, sin `any`).
  - `npm run lint`: 0 errores, 0 advertencias de ESLint.
  - `npm test`: 12/12 pruebas unitarias de dominio FIBA aprobadas.
  - `npm run build`: Compilación en producción con Turbopack exitosa (11 rutas generadas entre estáticas y Partial Prerender).

## Fase 7: Cierre integral, modales, identidad CAMG y manual del sistema

Rama `feat/hoop-completion` (base `2ff282a`). Especificación y bitácora en `odd/tasks/hoop-completion.md`.

- **Decisión de alcance**: sin servidor en esta fase (offline-first por diseño). "Backend" se interpretó como las capas del núcleo (`domain`, `application`, `infrastructure`). La sincronización con servidor quedó planificada como fase siguiente (PostgreSQL, login con correo y contraseña, outbox, LWW + jugadas append-only, SSE).
- **Núcleo** (`5d1986d`, `c4bbcf0`):
  - El jugada a jugada es la fuente única: marcador, faltas de equipo, parciales y box score se derivan de los eventos, por lo que deshacer funciona entre períodos.
  - Lógica del store movida a casos de uso puros y testeados (`startMatch`, `recordEvent`, `undoLastEvent`, `substitutePlayer`, `requestTimeout`, `changeQuarter`, `setClock`, `finishMatch`, divisiones y jugadores).
  - `+/-` medido desde el quinteto inicial (`startingLineupOwn`).
  - Tiempos muertos FIBA por período (2/3/1 por suplementario); faltas de suplementario cuentan como 4.º cuarto.
  - Matriz RBAC (`can(role, permission)`), analítica de temporada, versión de store con migración que vuelve a sembrar datos y semilla realista con partidos completos.
  - Al renombrar una división se renombra su equipo; el entrenador principal puede quitarse.
- **Presentación base** (`e269adf`): sistema de diálogos propio (`notify` / `confirm` sobre `ModalSheet`, `DialogHost` en el layout) que reemplaza todos los `alert()`; primitivas compartidas (`TextField`, `SelectField`, `FilterChip`, `LinkButton`, `IconButton`, `PageHeader`, `EmptyState`, `SectionCard`, `FilterChipGroup`, `ThemeToggle`); texto mínimo de 12 px y tamaños de icono unificados.
- **Pantallas de gestión** (`c95cb03`): Dashboard con KPIs, líderes y alertas médicas calculados desde los datos; ABM de divisiones (con asignación de entrenador), jugadores (con parte médico y convocatoria de juveniles) y partidos; convocatoria de 5 a 12 jugadores con 5 titulares y quinteto bloqueado una vez iniciado.
- **Consola en vivo y planilla** (`6d7fbe4`, `e17f7aa`): reloj persistido, tiempos muertos con confirmación, faltas del rival, propuesta de cambio de período a 00:00, finalización del partido, parciales con suplementarios, filtros del mapa de tiros, `/matches/live` con estado vacío. Corrección de `Suspense` para `useParams` con `cacheComponents`.
- **Identidad del Club Atlético Monte Grande** (`bdbc24f`, `e09d43b`): paleta roja y negra del club, tipografías Archivo y Archivo Narrow, motivos de franjas diagonales y año 1922, escudo, animaciones GSAP que respetan `prefers-reduced-motion`. Datos de demostración con el nombre del club, Estadio CAMG, correos `@camg.com.ar` y store en versión 3 (los datos guardados de versiones anteriores se vuelven a sembrar).
- **Documentación**: manual del sistema en `docs/MANUAL.md` (uso por pantalla, flujos, reglas FIBA, datos, identidad visual, arquitectura, limitaciones y glosario) y `README.md` real en reemplazo del de `create-next-app`.
- **Verificación registrada en la bitácora**: `npm test` 124/124, `npx tsc --noEmit` y `npm run lint` sin errores, `npm run build` correcto (11 rutas) al cierre de la consola en vivo; sin pruebas en navegador.
- **Pendientes conocidos**: entretiempo (`HALFTIME`) no gestionado por la consola; empate tras el 4.º suplementario solo avisa; no se modela el límite de tiempos muertos en los últimos 2 minutos del 4.º cuarto; no se impide el dorsal repetido en un equipo; roles simulados (resuelto en la Fase 8).

## Fase 8: Servidor, base de datos y sincronización local primero

Pedido (L10 de `odd/tasks/hoop-completion.md`): que todo se guarde en el navegador y también vaya al servidor, que lo nuevo pise lo viejo y que sin internet se guarde local y se envíe al volver. Decisiones: PostgreSQL (Docker en desarrollo), login real con correo y contraseña, roles validados en el servidor, push en vivo con SSE.

- **Servidor** (`26e5035`, `85ffa99`, `85f3a67`): `docker-compose.yml` con `postgres:17-alpine`; Drizzle + `pg` con migraciones versionadas en `drizzle/`; tablas `users`, `sessions`, `sync_records` (LWW por `updatedAt`, tombstones, `seq` global) y `match_events` (append-only, la eliminación es permanente). Contraseñas scrypt, sesión en cookie httpOnly `hoop_session` (`SESSION_COOKIE_SECURE` para LAN por `http`), RBAC del servidor con `can()` del dominio, `POST /api/sync/push`, `GET /api/sync/pull` paginado y `GET /api/sync/stream` (SSE con LISTEN/NOTIFY). Endurecimiento: seed solo de inserción, guardas de `Origin` y JSON en login/logout/push, rechazo de `updatedAt` más de 5 minutos en el futuro, logs sin datos sensibles.
- **Motor de sincronización del cliente** (T10): núcleo puro en `src/core/application/sync/` escrito con pruebas primero.
  - `diffClubState`: detecta cambios por referencia e ID (partidos sin jugadas; jugadas nuevas y eliminadas aparte).
  - Outbox persistente (`hoop-sync-storage`): un cambio por `tipo:id` y por jugada, `updatedAt` siempre posterior a la versión anterior del registro, lotes de 500 registros / 2000 jugadas, revisiones para no perder cambios hechos durante un envío, jugada agregada y quitada antes de enviarse se descarta.
  - Fusión: LWW contra un mapa de versiones local, tombstones, jugadas ordenadas por hora e ID, marcador re-derivado; primera sincronización de una tablet reemplaza los datos de demostración locales con la copia del servidor; cursor del servidor menor que el local = reinicio de la base y resincronización completa.
  - Motor (`createSyncEngine`) sin dependencias del navegador: debounce de 500 ms, reintentos con espera creciente hasta 60 s, `online`/`offline`, SSE, 401 hacia el login conservando la cola, y lo descargado nunca vuelve a la cola.
- **Acceso y sesión**: pantalla `/login` con la identidad del club; `SessionProvider` montado en el layout (la consola en vivo no usa el shell) que redirige a `/login` sin sesión guardada, abre sin conexión con el último perfil (`hoop-auth-storage`, nunca tokens) y lo confirma con `/api/auth/me` al haber red. El selector de rol simulado pasó a ser un menú de usuario (nombre, rol, estado de sincronización, cerrar sesión con confirmación si quedan cambios sin enviar).
- **Indicador de sincronización**: Sincronizado (hace cuánto) / Sincronizando / Sin conexión (N pendientes) / Error (tocar para reintentar), en el riel lateral, en una barra superior nueva en teléfonos y en el menú de usuario del Dashboard.
- **Documentación**: manual con las secciones de sincronización, servidor y base de datos (Docker, variables de entorno, cuentas por rol, API, seguridad, solución de problemas) y README con el inicio rápido del servidor.
- **Limitaciones conocidas**: conflictos por registro completo (no por campo); una pestaña por dispositivo; el reinicio de la base se detecta con el próximo envío o aviso en vivo; la consola en vivo no muestra el indicador; sin pruebas en navegador.
