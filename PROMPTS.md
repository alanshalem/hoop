Lee el archivo `CLAUDE.md` y ejecuta la **FASE 1: Cimientos, Design System CSS y Dominio de Básquet**.
No uses placeholders ni dejes archivos incompletos. Crea:

1. **Estructura de Carpetas**: Crea el árbol de directorios completo bajo `src/` respetando Clean Architecture (`core/domain`, `core/application`, `core/infrastructure`) y Atomic Design (`presentation/atoms`, `molecules`, `organisms`, `templates`).
2. **Design System con CSS Variables (`src/app/globals.css`)**:
   - Define todas las CSS Custom Properties para colores (tema oscuro de alto contraste "Arena Dark" y tema claro), escala tipográfica fluida, espaciados, bordes, sombras, z-index y tamaños de touch-targets (`--touch-min: 48px`, `--touch-lg: 56px`).
   - Incluye un reset moderno, soporte para `touch-action: manipulation` (evitar doble tap zoom en tablets) y ocultamiento limpio de scrollbars en paneles táctiles.
3. **Capa de Dominio (`src/core/domain/`)**:
   - `entities/club.types.ts` y esquemas Zod:
     - `User` (Roles: `ADMIN`, `HEAD_COACH`, `ASSISTANT_STATISTICIAN`).
     - `Division` (Ej: Primera División, U21, U19, U17, U15, U13, Mini, Femenino).
     - `Team` (Plantel asociado a una división y temporada, entrenador asignado).
     - `Player` (ID, nombre, apellido, dorsal `0` a `99`, altura en cm, peso, mano hábil, posición de básquet: `PG` Base, `SG` Escolta, `SF` Alero, `PF` Ala-Pívot, `C` Pívot, estado físico: `ACTIVE`, `INJURED`, `SUSPENDED`).

   - `entities/match.types.ts` y reglas FIBA puras (`rules/basketball-rules.ts`):
     - `Match` (ID, equipo propio, rival, fecha, condición Local/Visitante, torneo, estado: `SCHEDULED`, `LIVE`, `HALFTIME`, `FINISHED`, cuarto actual: `Q1`, `Q2`, `Q3`, `Q4`, `OT1`, `OT2`, tiempos muertos disponibles).
     - `PlayByPlayEvent`: Eventos atómicos con timestamp de cuarto, jugador, coordenadas opcionales `(x, y)` en media cancha y tipo (`FT_MADE`, `FT_MISS`, `FG2_MADE`, `FG2_MISS`, `FG3_MADE`, `FG3_MISS`, `OREB`, `DREB`, `AST`, `STL`, `BLK`, `TOV`, `FOUL_PERSONAL`, `FOUL_TECHNICAL`, `FOUL_UNSPORTSMANLIKE`, `SUBSTITUTION`).
     - Funciones puras de dominio (testeables y sin dependencias): cálculo automático del **Box Score por jugador** (Puntos, T1%, T2%, T3%, TC%, Rebotes O/D/Tot, Asistencias, Tapones, Robos, Pérdidas, Faltas, Más/Menos `+/-`, y **Valoración FIBA / PIR**), estado de **Bonus de equipo** (>= 4 faltas en el cuarto) y estado de **Exclusión de jugador** (5 faltas).

     Ejecuta la **FASE 2: Biblioteca de Componentes Atómicos (CSS Modules + GSAP) y AppShell para Tablet/Mobile**.

     Construye los siguientes componentes con sus respectivos archivos `.module.css`, asegurando accesibilidad (ARIA), área táctil mínima de `48px` y animaciones fluidas con `@gsap/react`:
     1. **Atoms (`src/presentation/atoms/`)**:
        - `TouchButton`: Botón táctil con variantes (`primary`, `secondary`, `success`, `danger`, `ghost`, `courtAction`), tamaños (`md`, `lg`, `xl`) y micro-interacción GSAP al presionar (`scale: 0.95` y rebote elástico sutil).
        - `JerseyBadge`: Dorsal de camiseta de básquet estilizado, muestra el número grande (`00-99`) y color según estado (en cancha, en banca, 4 faltas advertencia, 5 faltas expulsado).
        - `FoulDots`: Indicador visual de las 5 faltas de un jugador (5 círculos que se encienden de verde/amarillo hasta rojo en la 5ta falta).
        - `StatBadge` y `StatusPill`: Indicadores compactos para posiciones (`PG`, `SG`, `SF`, `PF`, `C`) y estados.

     2. **Molecules (`src/presentation/molecules/`)**:
        - `PlayerCard`: Tarjeta de jugador optimizada para toque rápido (muestra dorsal, apellido, posición, puntos actuales, faltas con `FoulDots` y estado).
        - `ModalSheet`: Bottom-sheet en móvil / Modal centrado en tablet animado con GSAP para formularios rápidos sin salir de contexto.

     3. **Templates (`src/presentation/templates/TabletAppShell/`)**:
        - Navegación adaptativa: En **Tablet (Landscape/Portrait)** usa un Navigation Rail lateral izquierdo compacto con iconos grandes y etiquetas claras; en **Mobile** usa una Bottom Navigation Bar fija en la zona del pulgar.
        - Rutas integradas: `Dashboard`, `Divisiones y Equipos`, `Jugadores`, `Calendario / Fechas`, y un botón destacado "MODO PARTIDO (LIVE)" y selector de Usuario/Rol (simulando sesión activa con RBAC).

        Ejecuta la **FASE 3: Stores Persistentes, Datos Semilla de Básquet y Gestión de Club (Divisiones, Equipos, Jugadores)**.
        1. **Store y Persistencia (`src/core/application/stores/useClubStore.ts`)**:
           - Implementa en Zustand (con `persist` en localStorage) la gestión completa de Usuarios/Auth simulada, Divisiones, Equipos, Jugadores y Fechas/Partidos.
           - Carga **Datos Semilla (Seed Data) realistas de un club de básquet argentino** en el primer inicio:
             - 3 Divisiones iniciales (`Primera División`, `Sub-19 (U19)`, `Sub-17 (U17)`).
             - Al menos 12 jugadores completos en Primera División con posiciones reales (`PG`, `SG`, `SF`, `PF`, `C`), dorsales típicos, alturas (1.82m a 2.08m) y estadísticas previas.
             - 3 Partidos en el calendario (1 finalizado con estadísticas completas, 1 **EN VIVO / LISTO PARA JUGAR HOY**, y 1 programado para la próxima fecha).

        2. **Páginas y Organismos de Gestión (`src/app/` y `src/presentation/organisms/`)**:
           - **Login y Cambio Rápido de Rol**: Vista limpia para entrar como `Entrenador`, `Asistente Planillero` o `Administrador`.
           - **Módulo de Divisiones y Equipos (`/divisions`)**: Vista en grilla táctil para crear/editar divisiones, ver sus planteles y asignar entrenadores.
           - **Módulo de Jugadores (`/players`)**:
             - Filtros rápidos por toque (Por División, Posición `PG/SG/SF/PF/C`, Estado físico).
             - Buscador instantáneo y formulario en `ModalSheet` con `react-hook-form` + `zod` para crear/editar jugadores.
             - Posibilidad de convocar a un juvenil (ej. U19) al plantel de Primera para un partido específico.

           Ejecuta la **FASE 4: Dashboard del Entrenador, Gestión de Fechas (Partidos) y Armado de Quinteto Inicial**.
           1. **Dashboard Principal (`/`)**:
              - Tarjeta Hero "Próximo Partido / Partido de Hoy" con botón directo para **Abrir Consola en Vivo en Tablet**.
              - KPIs del Club y de la División activa: Récord de temporada (`G - P`), Promedio de Puntos a Favor / En Contra, Líderes del equipo (Puntos por partido `PPG`, Rebotes `RPG`, Asistencias `APG`, Valoración `PIR`), y alerta de jugadores lesionados.
              - Animación de entrada escalonada (`stagger`) en GSAP para las tarjetas del dashboard.
           2. **Calendario y Fechas (`/matches`)**:
              - Listado por fechas/jornadas con filtros por División y Estado (`Programados`, `En Juego`, `Finalizados`).
              - Formulario para crear una nueva Fecha/Partido (División, Rival, Fecha/Hora, Cancha, Condición Local/Visitante).
           3. **Armado de Convocatoria y Quinteto Inicial (Pre-Partido)**:
              - Pantalla táctil donde el entrenador selecciona los **10 a 12 convocados** de la plantilla y marca a los **5 Titulares (Starting Five)**.
              - Validación visual: debe exigir exactamente 5 titulares antes de habilitar el salto inicial ("Iniciar Partido en Vivo").

           Ejecuta la **FASE 5: Consola "Live Match Day" (`/matches/[id]/live`) optimizada al 100% para Tablet en Cancha**.

           Esta pantalla debe ocupar el 100% del viewport (`100dvh`, sin scroll vertical general) con un layout en CSS Grid pensado para usar con ambas manos en una tablet:
           1. **Header: Scoreboard Electrónico FIBA (`ScoreboardHeader`)**:
              - Marcador gigante Local vs Visitante (con animación GSAP al sumar puntos).
              - Selector/Indicador de Cuarto (`Q1`, `Q2`, `Q3`, `Q4`, `OT`) y Cronómetro de partido (Play/Pausa y ajuste rápido de minutos/segundos).
              - Indicador luminoso de **Faltas de Equipo en el Cuarto** (4 luces por equipo, encendiendo el cartel **"BONUS"** rojo al llegar a la 4ta falta).
              - Botones rápidos para sumar puntos al Rival (`+1`, `+2`, `+3` Rival) y pedir **Tiempo Muerto (Timeout)**.

           2. **Columna Izquierda: Quinteto en Cancha + Banca (`OnCourtLineup`)**:
              - Muestra grande a los **5 jugadores actualmente en cancha** (con su dorsal, apellido, puntos y `FoulDots`).
              - Abajo o en pestaña rápida: los **7 suplentes en banca**.
              - **Cambio Rápido (Sustitución)**: Tocar botón "Cambio", tocar jugador que sale, tocar jugador que entra -> Animación GSAP de intercambio de posición.

           3. **Centro: Media Cancha Interactiva SVG (`HalfCourtShotChart`) + Play-by-Play**:
              - Dibujo vectorial limpio en SVG de media cancha de básquet reglamentaria (línea de 3 puntos, pintura/zona restringida, tiro libre).
              - Si el asistente toca un jugador y luego toca un punto en la cancha:
                - Detecta automáticamente por geometría si el tiro fue de **2 Puntos** o **3 Puntos** (fuera del arco).
                - Abre un micro-selector radial instantáneo en ese punto: `¡ADENTRO! (Verde)` o `ERRADO (Rojo)` y dibuja el marcador (`O` verde o `X` roja) con animación GSAP.
              - Debajo de la cancha: **Últimas 5 jugadas (Timeline)** con botón **"DESHACER (Undo)"** de un solo toque por si el asistente se equivocó de botón en la velocidad del partido.

           4. **Columna Derecha: Pad de Acciones en 1 Toque (`QuickActionPad`)**:
              - Cuando hay un jugador seleccionado en cancha, este panel permite registrar sin usar el mapa si se prefiere velocidad pura:
                - Tiros Convertidos: `+1 TL`, `+2 DOBLE`, `+3 TRIPLE`.
                - Tiros Errados: `Fallo TL`, `Fallo 2P`, `Fallo 3P`.
                - Juego: `REB OFENSIVO`, `REB DEFENSIVO`, `ASISTENCIA`, `ROBO`, `TAPÓN`, `PÉRDIDA`.
                - Faltas: `FALTA PERSONAL`, `FALTA TÉCNICA` (si llega a la 5ta falta, dispara una alerta visual GSAP pidiendo sustitución obligatoria).

              Ejecuta la **FASE 6: Planilla Estadística Post-Partido (Box Score FIBA), Shot Chart Analítico y Verificación de Build**.
              1. **Vista de Resumen y Box Score del Partido (`/matches/[id]/stats`)**:
                 - Tabla **Box Score FIBA profesional** en CSS Modules (con columna de jugador fija en scroll horizontal móvil):
                   - Columnas: `Dorsal`, `Jugador`, `MIN`, `PTS`, `T2 (C/I y %)`, `T3 (C/I y %)`, `TL (C/I y %)`, `REB (O-D-TOT)`, `AST`, `STL`, `BLK`, `TOV`, `PF` (Faltas), `+/-`, y `VAL (PIR)`.
                   - Fila final con **Totales y Porcentajes del Equipo**.
                 - **Filtro de Mapa de Tiros (Shot Chart Analítico)**: Permite filtrar los tiros dibujados en la media cancha por Jugador específico o por Cuarto (`Q1-Q4`), mostrando efectividad por zona.
                 - Comparativa por Cuartos (Parciales `Q1 | Q2 | Q3 | Q4 | FINAL`).
              2. **Auditoría de Calidad y Build**:
                 - Revisa todos los componentes para confirmar que no exista ningún `any` en TypeScript, que todos los archivos `.module.css` usen las variables de `globals.css`, y ejecuta `npm run build` (o `tsc --noEmit`) para garantizar cero errores de compilación.
