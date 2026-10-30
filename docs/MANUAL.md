# Manual del sistema HoopOS · Club Atlético Monte Grande

HoopOS es el sistema de básquet del Club Atlético Monte Grande (CAMG): divisiones, planteles, calendario de partidos y estadísticas FIBA registradas en vivo desde una tablet al borde de la cancha. Este manual describe el sistema tal como está implementado hoy, primero para quien lo usa y después para quien lo mantiene.

> Estado de esta versión: todo funciona en el navegador, sin servidor. Los datos se guardan en el `localStorage` del dispositivo y los roles se simulan. La sincronización con un servidor está en desarrollo (ver [Limitaciones conocidas y roadmap](#9-limitaciones-conocidas-y-roadmap)).

## Índice

1. [Qué es HoopOS](#1-qué-es-hoopos)
2. [Inicio rápido](#2-inicio-rápido)
3. [Roles y permisos](#3-roles-y-permisos)
4. [Guía por pantalla](#4-guía-por-pantalla)
5. [Flujos paso a paso](#5-flujos-paso-a-paso)
6. [Reglas FIBA aplicadas](#6-reglas-fiba-aplicadas)
7. [Datos y persistencia](#7-datos-y-persistencia)
8. [Identidad visual](#8-identidad-visual)
9. [Limitaciones conocidas y roadmap](#9-limitaciones-conocidas-y-roadmap)
10. [Arquitectura](#10-arquitectura)
11. [Glosario](#11-glosario)

---

## 1. Qué es HoopOS

| Rasgo | Qué significa en la práctica |
|-------|------------------------------|
| Del club | Marca, escudo y paleta del Club Atlético Monte Grande (fundado en 1922). Los datos de demostración corresponden al club. |
| Offline-first | Cada acción se guarda al instante en el navegador. Un corte de WiFi o 4G en el estadio no interrumpe el registro del partido. |
| Tablet-first | Pensado para tablet (horizontal o vertical) y teléfono. Áreas táctiles de 48 px como mínimo y de 56 px en la consola en vivo. Registro de jugadas en dos toques. |
| Reglas FIBA | Faltas, bonus, tiempos muertos, duración de períodos, convocatoria, PIR y +/- siguen el reglamento FIBA (detalle en la [sección 6](#6-reglas-fiba-aplicadas)). |
| Sin alertas del navegador | Todos los avisos y confirmaciones son modales propios de la aplicación (`notify` y `confirm`). Nunca se usa `alert`, `confirm` ni `prompt` del navegador. |

---

## 2. Inicio rápido

### Requisitos

- Node.js 20.9 o superior (lo exige Next.js 16; se recomienda la versión LTS vigente). El proyecto no fija `engines` propio en `package.json`.
- npm (incluido con Node.js).

### Puesta en marcha

1. Instalar dependencias: `npm install`
2. Levantar el entorno de desarrollo: `npm run dev`
3. Abrir `http://localhost:3000`. La primera carga crea los datos de demostración en el navegador.

### Scripts disponibles

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Servidor de desarrollo de Next.js. |
| `npm run build` | Compilación de producción. |
| `npm run start` | Sirve la compilación de producción (requiere `npm run build` antes). |
| `npm run lint` | ESLint con la configuración de Next.js (`eslint.config.mjs`). |
| `npm test` | Pruebas unitarias del núcleo: `tsx --test src/**/*.test.ts` (runner `node:test`). |

Control de tipos (no tiene script propio): `npx tsc --noEmit`.

---

## 3. Roles y permisos

Hay tres roles. Cada pantalla oculta o deshabilita lo que el rol activo no puede hacer, usando la matriz de `src/core/domain/rules/permissions.ts` (función `can(role, permission)`).

### Matriz de permisos

| Permiso | Qué habilita | Administrador | Entrenador principal | Asistente planillero |
|---------|--------------|:-------------:|:--------------------:|:--------------------:|
| `MANAGE_DIVISIONS` | Crear, editar y eliminar divisiones; asignar entrenador | Sí | No | No |
| `MANAGE_PLAYERS` | Crear, editar y eliminar jugadores; convocar juveniles a Primera | Sí | Sí | No |
| `MANAGE_MATCHES` | Crear, editar y eliminar partidos programados | Sí | Sí | No |
| `MANAGE_LINEUP` | Armar convocatoria y quinteto; iniciar el partido | Sí | Sí | No |
| `RECORD_LIVE` | Usar la consola en vivo: reloj, períodos, jugadas, cambios, tiempos muertos, finalizar | Sí | Sí | Sí |

Lo que cualquier rol puede ver: dashboard, listado de divisiones y su plantel ("Ver plantel"), jugadores, calendario, convocatorias (en modo lectura) y planillas estadísticas. Sin `RECORD_LIVE` la consola se abre en modo lectura con un aviso.

### Cambiar de rol

- Tablet o escritorio: selector **Rol activo** al pie del riel de navegación lateral, junto al nombre del usuario.
- Teléfono: el componente `UserRoleSwitcher` aparece en la cabecera del Dashboard (tres botones: Entrenador principal, Asistente planillero, Administrador).

Al elegir un rol, el sistema toma el primer usuario de demostración con ese rol:

| Rol | Usuario de demostración |
|-----|-------------------------|
| Entrenador principal (rol inicial) | Federico Balbi |
| Asistente planillero | Mariano Ginóbili |
| Administrador | Alejandro Montecchia |

> El cambio de rol es una simulación: no hay inicio de sesión ni contraseña en esta versión, y los permisos solo se aplican en la interfaz. El rol elegido se guarda junto con el resto de los datos.

---

## 4. Guía por pantalla

### Navegación general

| Elemento | Dónde | Función |
|----------|-------|---------|
| Riel lateral (tablet) | Izquierda | Escudo y marca (vuelve al inicio), Dashboard, Divisiones, Jugadores, Partidos, botón **Partido en vivo**, selector de rol, nombre del usuario y botón de tema claro/oscuro. |
| Barra inferior (teléfono) | Abajo | Inicio, Equipos, botón central de partido en vivo (icono `Radio`), Plantel y Fechas. |
| Diálogos | Sobre la pantalla | Modales propios: avisos (`notify`, botón "Entendido") y confirmaciones (`confirm`, botones "Cancelar" y la acción). Se muestran de a uno, en cola. |

### Dashboard (`/`)

Resumen de la temporada de la división elegida.

| Control o bloque | Qué hace |
|------------------|----------|
| Chips **División del tablero** | Cambian la división que alimentan los indicadores. Solo aparecen si hay más de una división. |
| Tarjeta principal | Si hay un partido en juego: marcador, período y reloj, con botones **Convocatoria** y **Abrir consola en vivo**. Si no, el próximo partido programado con **Ver calendario** y **Armar quinteto** (o **Ver convocatoria** sin permiso de convocatoria). Considera los partidos de todas las divisiones. |
| Indicadores | Récord (ganados-perdidos y % de victorias), puntos a favor (con diferencial), puntos en contra y efectividad de tiros de campo y de triples. Se calculan con los partidos finalizados del equipo. |
| Líderes del equipo | Promedio por partido de puntos (PPG), rebotes (RPG), asistencias (APG) y valoración (PIR). Un jugador suma un partido cuando figura en la convocatoria. |
| Últimos resultados | Hasta 5 partidos finalizados (G, P o E) con enlace a su planilla. |
| Alertas médicas | Jugadores lesionados o suspendidos de todo el club, con su parte médico. |

### Divisiones (`/divisions`)

Cada tarjeta muestra nombre, categoría, descripción, cantidad de jugadores, temporada y entrenador principal.

| Control | Qué hace | Permiso |
|---------|----------|---------|
| **Nueva división** | Abre el formulario de alta. | `MANAGE_DIVISIONS` |
| **Ver plantel** | Modal de solo lectura con los jugadores del equipo (incluye juveniles convocados, marcados "Convocado") y sus partes médicos. | Todos |
| Lápiz (`Pencil`) | Editar la división y su entrenador. | `MANAGE_DIVISIONS` |
| Papelera (`Trash2`) | Eliminar la división, con confirmación. | `MANAGE_DIVISIONS` |

Campos del formulario: **Nombre** (mínimo 2 caracteres), **Categoría** (Primera, Sub-21, Sub-19, Sub-17, Sub-15, Sub-13, Mini básquet, Femenino, Otra categoría), **Entrenador principal** (usuarios con rol de entrenador principal, u opción "Sin entrenador asignado") y **Descripción o torneo** (máximo 120 caracteres).

### Jugadores (`/players`)

| Control | Qué hace | Permiso |
|---------|----------|---------|
| **Buscar jugador** | Filtra por apellido, nombre o dorsal exacto. | Todos |
| Chips **División**, **Posición**, **Estado** | Filtros combinables; cada chip muestra cuántos jugadores quedarían. Aparece "Sin equipo" si hay jugadores sin división. | Todos |
| **Nuevo jugador** | Abre el formulario de alta. | `MANAGE_PLAYERS` |
| Tocar la tarjeta | Abre el jugador para editarlo o eliminarlo. | `MANAGE_PLAYERS` |
| **Convocar a Primera** | Suma un juvenil al plantel de Primera (ver [flujo](#convocar-un-juvenil-a-primera)). | `MANAGE_PLAYERS` |

Cada tarjeta muestra dorsal, posición, estado, puntos de la temporada (partidos finalizados), altura, mano hábil, división y parte médico.

Campos del formulario: Nombre, Apellido, Dorsal (0 a 99), Posición (Base, Escolta, Alero, Ala-Pívot, Pívot), Altura en cm (120 a 240), Peso en kg (opcional), Mano hábil, Estado físico (Disponible, Lesionado, Suspendido), División y Parte médico (máximo 240 caracteres). En modo edición aparece el botón **Eliminar**, con confirmación.

### Partidos (`/matches`)

Orden fijo: primero los partidos en juego, después los programados (el más próximo primero) y al final los finalizados (el más reciente primero).

| Control | Qué hace |
|---------|----------|
| Chips **Estado** | Todos, En vivo, Programados, Finalizados. |
| Chips **División** | Filtra por división. Los partidos de una división eliminada aparecen como "División eliminada". |
| **Nuevo partido** | Abre el formulario (requiere `MANAGE_MATCHES`). |

Acciones de cada tarjeta según su estado:

| Estado | Acciones |
|--------|----------|
| En vivo | **Convocatoria** y **Consola en vivo**. |
| Programado | Editar y eliminar (con `MANAGE_MATCHES`); **Armar quinteto** o **Ver convocatoria**. |
| Finalizado | **Planilla box score**. |

Campos del formulario: **División** (el equipo propio se deduce de ella), **Equipo rival**, **Fecha y hora**, **Condición** (Local o Visitante), **Torneo o competencia** y **Estadio o cancha** (opcional). Si al editar se cambia la división, se vacían la convocatoria y el quinteto del partido.

### Quinteto y convocatoria (`/matches/[id]/lineup`)

La pantalla tiene tres modos según el estado del partido:

| Modo | Estado del partido | Qué se puede hacer |
|------|--------------------|--------------------|
| Preparación | Programado | Elegir convocados (máximo 12) y exactamente 5 titulares; **Iniciar partido**. |
| En juego | En vivo | El quinteto inicial queda bloqueado. Solo se pueden sumar convocados y guardarlos con **Guardar convocatoria**; **Volver a la consola**. |
| Finalizado | Finalizado | Solo lectura; **Ver box score**. |

- Candidatos: los jugadores del equipo del partido más los juveniles convocados a ese equipo. Los suspendidos no se pueden convocar.
- Contadores: `convocados/12` y `titulares/5`, en verde cuando son válidos.
- Mensajes: lista de lo que falta para iniciar, advertencia si hay lesionados convocados y aviso si el rol no puede editar.
- En preparación, la selección es un borrador: se guarda en el partido recién al pulsar **Iniciar partido**.

### Consola en vivo (`/matches/[id]/live`)

Pantalla de registro del partido en cancha, a altura completa y sin desplazamiento general.

**Distribución.** Desde 900 px de ancho: a la izquierda quinteto y banca, al centro la media cancha y las últimas jugadas, a la derecha el pad de acciones. En pantallas más angostas, tres pestañas: **Quinteto**, **Cancha** y **Acciones**. Al elegir un jugador en el teléfono se pasa sola a **Acciones**.

**Accesos.** Si el partido está programado, la consola muestra un aviso con el botón para armar el quinteto. Si está finalizado, muestra el resultado y un enlace a la planilla.

| Zona | Controles |
|------|-----------|
| Tablero (arriba) | Por equipo (local a la izquierda, visitante a la derecha): nombre, marcador, cuatro luces de faltas de equipo con el contador `N F`, indicador **Bonus** y botón **TM** con los tiempos muertos que quedan. Al centro: selector de período (`1C` a `4C`, y `S1` a `S4` para suplementarios), reloj con **-10s**, **+10s** y **Iniciar/Pausar**. |
| Barra de herramientas | **Partidos** (volver), acciones del rival (**+1**, **+2**, **+3**, **Falta**), **Planilla** y **Finalizar**. |
| En cancha / Banca | Tarjetas de jugador con puntos y faltas. Tocar un jugador en cancha lo selecciona. Botón **Cambio** para sustituciones. Los excluidos por faltas aparecen en la banca marcados "Excluido". |
| Media cancha | Tocar la posición registra un tiro del jugador seleccionado. Muestra los tiros con ubicación (círculo: convertido; cruz: fallado). |
| Últimas jugadas | Las 6 jugadas más recientes, de la más nueva a la más vieja, con el botón **Deshacer**. |
| Acciones rápidas | Grupos **Convertidos** (`+1 TL`, `+2`, `+3`), **Fallados** (`TL`, `2P`, `3P`), **Rebotes y juego** (Reb. ofensivo, Reb. defensivo, Asistencia, Robo, Tapa, Pérdida) y **Faltas** (Personal, Técnica, Antidep.). |

Sin el permiso `RECORD_LIVE` se muestra el banner "Modo lectura" y se ocultan o deshabilitan todos los controles.

### Partido en vivo (`/matches/live`)

Atajo del botón **Partido en vivo**. Si hay un partido en juego, redirige a su consola; si no, muestra "No hay partidos en juego" con un enlace a Partidos.

### Planilla estadística (`/matches/[id]/stats`)

| Bloque | Contenido |
|--------|-----------|
| Resultado | Marcador propio y rival. Si terminó: Victoria, Derrota o Empate. Si está en juego: estado y período, con acceso a la **Consola en vivo**. |
| Parciales por período | Puntos por cuarto (1C a 4C) más los suplementarios que tuvieron jugadas. |
| Box score | Una fila por convocado y una de totales: PTS, T2, T3, TL, TC (convertidos/intentados y %), REB (ofensivos-defensivos-totales), AST, ROB, TAP, PER, FAL, +/- y VAL (PIR). Los excluidos por faltas llevan el icono `Ban`. La tabla se desplaza en horizontal con la columna del jugador fija. |
| Mapa de tiros | Filtros **Período** (Todos o un período) y **Jugador** (Todo el equipo o cada lanzador). Efectividad de dobles, triples y total de campo para el filtro elegido. Una nota indica cuántos tiros se cargaron desde el pad y no tienen ubicación en el mapa. |

Un partido programado muestra "El partido todavía no comenzó".

---

## 5. Flujos paso a paso

### Crear una división

1. Rol Administrador. Ir a **Divisiones** y pulsar **Nueva división**.
2. Completar nombre, categoría, entrenador (opcional) y descripción.
3. Pulsar **Crear división**. Se crea también su equipo para la temporada 2025/2026, con el nombre `Club Atlético Monte Grande - <nombre de la división>`.

Eliminar una división (papelera, con confirmación) borra su equipo y deja a sus jugadores sin equipo. Sus partidos se conservan en el calendario como "División eliminada".

### Asignar o quitar el entrenador principal

1. Rol Administrador. En la tarjeta de la división, pulsar el lápiz.
2. En **Entrenador principal**, elegir un usuario con rol de entrenador principal, o "Sin entrenador asignado".
3. **Guardar cambios**. Si el usuario ya no tiene ese rol, un modal lo informa.

Renombrar la división también renombra su equipo.

### Crear un jugador

1. Rol Administrador o Entrenador principal. Ir a **Jugadores** y pulsar **Nuevo jugador**.
2. Completar los datos y elegir la **División** (queda en el plantel de ese equipo).
3. Si está lesionado o suspendido, elegir el estado y cargar el **Parte médico**: aparece en las alertas médicas del Dashboard y en la convocatoria.
4. **Crear jugador**.

### Convocar un juvenil a Primera

1. En **Jugadores**, buscar un jugador de una categoría formativa (Sub-21, Sub-19, Sub-17, Sub-15, Sub-13 o Mini básquet).
2. Pulsar **Convocar a Primera**. Requiere que exista una división de categoría Primera.
3. Un modal confirma la convocatoria. El jugador conserva su división y pasa a figurar en el plantel de Primera con la etiqueta "Convocado a Primera", así que ya puede elegirse en la convocatoria de sus partidos. Si ya estaba convocado, el modal lo avisa.

### Crear un partido

1. Rol Administrador o Entrenador principal. Ir a **Partidos** y pulsar **Nuevo partido**.
2. Elegir la división (viene preseleccionada la del filtro de división, o la división activa del Dashboard), el rival, la fecha y hora, la condición, el torneo y el estadio.
3. Pulsar **Crear partido**. El partido queda **Programado** y se ordena por fecha.

### Armar la convocatoria y el quinteto, e iniciar el partido

1. En la tarjeta del partido, pulsar **Armar quinteto**.
2. En **Convocatoria**, tocar jugadores para sumarlos o quitarlos (máximo 12; si se supera, un modal lo indica).
3. En **Quinteto inicial**, tocar exactamente 5 convocados para marcarlos como titulares (el resto queda en "Banco").
4. Revisar los mensajes del panel de estado hasta ver "Convocatoria y quinteto listos para el salto inicial".
5. Pulsar **Iniciar partido**. Si algo no cumple las reglas, un modal lista los problemas. Si todo es válido, el partido pasa a **En vivo** y se abre la consola.

### Registrar jugadas en la consola

El reloj arranca en pausa al entrar. Pulsar **Iniciar** (icono `Play`) para que corra.

**Tiro desde la media cancha (dos toques con el jugador ya seleccionado):**

1. Tocar el jugador en **En cancha** (queda seleccionado; el encabezado de la cancha muestra "Tiro para #dorsal apellido").
2. Tocar la posición del tiro. El sistema decide si es doble o triple por la ubicación.
3. Tocar **Convertido +2/+3** o **Fallado 2P/3P** en el menú emergente (la `X` lo cancela).

Si no hay jugador seleccionado, un modal pide elegirlo primero.

**Acción desde el pad (dos toques):** tocar el jugador en cancha y luego la acción (por ejemplo `+3`, `Reb. defensivo` o `Personal`). Los tiros cargados desde el pad cuentan en el box score pero no tienen ubicación en el mapa.

Cada jugada guarda el período, el reloj real y el marcador resultante. El marcador, las faltas de equipo y el box score se recalculan al instante.

### Quinta falta y sustitución

**Exclusión.** Cuando un jugador llega a 5 faltas, el pad muestra "5 faltas: jugador excluido", deshabilita sus acciones y ofrece **Realizar sustitución**, que abre el modo cambio con ese jugador como saliente.

**Cambio.**

1. Pulsar **Cambio** en la columna de quinteto (o tocar directamente un jugador de la banca).
2. Tocar el jugador en cancha que sale y el de la banca que entra, en cualquier orden. Una pista indica qué falta elegir.
3. Con ambos elegidos, el cambio se registra solo. **Cancelar** sale del modo cambio.

Un jugador excluido no puede volver a entrar. Si el cambio no es válido, un modal explica el motivo.

### Tiempos muertos

1. Pulsar **TM** en el panel del equipo (propio o rival).
2. Confirmar en el modal, que indica cuántos quedan en la mitad o el suplementario.
3. El reloj se detiene y un aviso muestra los tiempos restantes. Sin tiempos disponibles, el modal "Sin tiempos muertos" lo informa y no se descuenta nada.

### Reloj y cambio de período

- **-10s** y **+10s** corrigen el reloj, siempre dentro de la duración del período.
- Tocar otro período en el selector pide confirmación, reinicia el reloj (10:00 o 05:00) e informa si las faltas de equipo vuelven a cero o se mantienen.
- Los suplementarios se habilitan de a uno desde el 4.º cuarto.
- Cuando el reloj llega a 00:00:
  - Durante 1.º a 3.er cuarto: el sistema ofrece pasar al período siguiente.
  - Al final del 4.º cuarto o de un suplementario, sin empate: ofrece finalizar el partido.
  - Con empate: ofrece el siguiente suplementario. Si el empate llega al final del 4.º suplementario, solo muestra un aviso.

### Puntos y faltas del rival

El rival no tiene jugadores cargados. En la barra de herramientas, **+1**, **+2** y **+3** suman puntos al rival, y **Falta** registra una falta de equipo del rival (enciende sus luces y su **Bonus**).

### Deshacer

**Deshacer** (en Últimas jugadas) elimina la última jugada registrada, sea propia o del rival. Si era un cambio, revierte el quinteto en cancha. El marcador y las faltas se recalculan desde las jugadas, así que deshacer funciona aunque la jugada sea de un período anterior. Los tiempos muertos y los cambios de período no son jugadas y no se deshacen con este botón.

### Finalizar el partido

1. Pulsar **Finalizar** en la barra de herramientas, o aceptar la propuesta del sistema cuando el reloj llega a 00:00.
2. Confirmar en el modal, que muestra el resultado final.
3. El partido pasa a **Finalizado**, no admite más jugadas y se abre su planilla estadística.

### Leer la planilla y el mapa de tiros

1. Abrir **Planilla box score** desde Partidos, **Planilla** desde la consola o un resultado del Dashboard.
2. Revisar los parciales por período y el box score.
3. En **Mapa de tiros**, combinar los filtros de período y jugador. Los indicadores de dobles, triples y total de campo se actualizan con el filtro.

---

## 6. Reglas FIBA aplicadas

| Regla | Implementación | Código |
|-------|----------------|--------|
| Exclusión por faltas | 5 faltas (personales, técnicas y antideportivas) excluyen al jugador. Con 4 se marca como advertencia. | `basketball-rules.ts` (`FIBA_MAX_PLAYER_FOULS`) |
| Bonus de equipo | Con 4 o más faltas de equipo en el período se enciende **Bonus**. Las faltas de cualquier suplementario cuentan como parte del 4.º cuarto. | `basketball-rules.ts`, `event-rules.ts` (`isSameTeamFoulPeriod`) |
| Tiempos muertos | 2 en la primera mitad, 3 en la segunda y 1 por cada suplementario. Los no usados no pasan a la mitad siguiente. Al entrar a un suplementario nuevo se repone 1. | `timeouts.ts` |
| Duración de períodos | 10 minutos por cuarto, 5 por suplementario, hasta 4 suplementarios. | `game-clock.ts` |
| Convocatoria | Entre 5 y 12 jugadores, exactamente 5 titulares y todos ellos convocados. | `lineup-rules.ts` |
| Valoración (PIR) | `(PTS + REB + AST + ROB + TAP) - (tiros de campo fallados + tiros libres fallados + PER + faltas cometidas)`. Cuenta todas las faltas del jugador. | `calculateFibaPir` |
| +/- | Diferencia de puntos mientras el jugador estuvo en cancha. Parte del quinteto inicial (`startingLineupOwn`) y sigue cada cambio propio en orden. | `calculatePlayerPlusMinus`, `getStartingLineup` |
| Doble o triple | Arco de triple a 6,75 m del aro (radio de 235 unidades sobre una media cancha SVG de 500 x 470). En las esquinas, la zona de triple es la franja junto a la línea lateral cerca de la línea de fondo. | `HalfCourtShotChart.tsx` (`isThreePointSpot`) |

No modelado: la restricción FIBA de usar como máximo 2 tiempos muertos en los últimos 2 minutos del 4.º cuarto.

Fuente única de verdad: el marcador, las faltas de equipo, los parciales y el box score se derivan siempre de la lista de jugadas del partido (`match-derivations.ts`). Los campos guardados en el partido son una copia que se recalcula en cada cambio.

---

## 7. Datos y persistencia

### Dónde se guardan

| Dato | Ubicación |
|------|-----------|
| Club, usuarios, divisiones, equipos, jugadores, partidos y jugadas, rol activo, división y partido activos | `localStorage`, clave `hoop-club-storage` (Zustand con el middleware `persist`). |
| Tema claro u oscuro | `localStorage`, clave `hoop-theme`. |
| Cola de diálogos, estado del reloj en marcha | Memoria (no se guarda). |

El reloj de juego se guarda en el partido al pausar, al corregirlo, al llegar a 00:00, con cada jugada, cambio, tiempo muerto o finalización, al ocultarse la página y al salir de la consola.

### Versión y migración

El almacenamiento lleva una versión (`CLUB_STORE_VERSION = 3`, en `src/core/application/stores/club-state.ts`). Si el navegador tiene datos de una versión anterior, se descartan y se cargan los datos de demostración actuales en lugar de fallar. Cada cambio en la forma de los datos guardados debe subir esa versión.

### Datos de demostración

Se generan en `src/core/infrastructure/mocks/seed-data.ts`, de forma determinística. Las fechas se calculan a partir del momento de la primera carga.

| Elemento | Contenido |
|----------|-----------|
| Club | Club Atlético Monte Grande (`club-camg`), temporada 2025/2026. |
| Usuarios | 5, con correos `@camg.com.ar`: Federico Balbi, Sergio Hernández y Julio Lamas (entrenadores principales), Mariano Ginóbili (asistente planillero) y Alejandro Montecchia (administrador). |
| Divisiones y equipos | Primera División, Sub-19 (U19) y Sub-17 (U17), cada una con su equipo `Club Atlético Monte Grande - <división>` y su entrenador. |
| Jugadores | 17: 12 de Primera (uno lesionado, con parte médico), 3 de Sub-19 y 2 de Sub-17. |
| Partidos finalizados | 3, con jugada a jugada completa: contra Peñarol de Mar del Plata (local), Quimsa (visitante) y Ferro Carril Oeste (local), hace 20, 13 y 6 días. |
| Partido en vivo | Contra Obras Sanitarias, hoy, en el Estadio CAMG: 2.º cuarto con 07:08 en el reloj y el rival en bonus. |
| Partido programado | Contra Boca Juniors como visitante, dentro de 7 días, con convocatoria precargada. |

### Volver a los datos de demostración

El store tiene la acción `resetToSeedData`, pero en esta versión ninguna pantalla la expone. Para empezar de cero:

1. Abrir las herramientas de desarrollo del navegador.
2. En **Aplicación** (o **Almacenamiento**), borrar la clave `hoop-club-storage` de `localStorage`, o usar "Borrar datos del sitio".
3. Recargar la página: se cargan los datos de demostración con fechas relativas al día actual.

> Borrar los datos del sitio elimina todo lo cargado en ese navegador. No hay copia en un servidor.

---

## 8. Identidad visual

### Paleta (tokens de `src/app/globals.css`)

| Token | Valor (tema oscuro) | Uso |
|-------|---------------------|-----|
| `--brand-primary` | `#E31B23` | Rojo del club: rellenos, botones principales, escudo. |
| `--brand-primary-hover` / `-active` | `#B31419` / `#8F1014` | Estados del rojo. |
| `--brand-primary-ink` | `#FF3B43` | Texto rojo sobre fondo oscuro (contraste). |
| `--brand-black` | `#111111` | Negro del club. |
| `--bg-base` | `#0A0A0A` | Fondo base. |
| `--bg-surface-2` / `--bg-surface-3` | `#18181B` / `#27272A` | Superficies. |
| `--color-success` | `#34D399` | Conversión, estados correctos. |
| `--color-warning` | `#FBBF24` | Advertencias (por ejemplo, 4 faltas). |
| `--color-danger` | `#F87171` | Peligro en coral, siempre con icono para no confundirse con el rojo del club. |
| `--color-info` | `#60A5FA` | Información. |

### Tipografía

- **Archivo** para el texto general (`--font-sans`).
- **Archivo Narrow** para títulos, en mayúsculas y con interlineado ajustado (`--font-display`).
- Ambas se cargan con `next/font/google` en `src/app/layout.tsx`. Las cifras usan números tabulares.
- El texto mínimo es de 12 px (`--text-2xs`).

### Motivos del club

- Franjas diagonales a 135 grados, como la camiseta (`--motif-stripes`).
- Resplandor rojo radial (`--motif-glow`).
- Año de fundación "1922" calado en la cabecera (`ClubHero`).
- Escudo en `public/brand/escudo-camg.png`.
- Anillo de foco de dos tonos para la navegación con teclado.

### Temas

- Oscuro por defecto. El tema claro se activa con el botón `Sun`/`Moon` del riel lateral y se guarda en `hoop-theme`.
- Un script en `<head>` aplica el tema antes del primer pintado para evitar destellos.
- El tablero electrónico y la cabecera del club (`data-surface="board"`) se mantienen negros y rojos en ambos temas.

### Movimiento

- Animaciones con GSAP (`gsap` y `@gsap/react`), sobre `transform` y `opacity`: entrada de páginas, rebote del marcador, luces de faltas, indicador de bonus, marcadores de tiro, entrada de jugadores en un cambio y modales.
- Con `prefers-reduced-motion: reduce`, las animaciones GSAP no se ejecutan (`useMotion` usa `gsap.matchMedia`) y las transiciones CSS se reducen al mínimo.

### Tamaños

| Concepto | Valores |
|----------|---------|
| Iconos `lucide-react` (`ICON_SIZE`) | 14, 16 (en línea con texto), 20 (navegación y botones), 24 (cabeceras), 32 (estados vacíos y diálogos). |
| Áreas táctiles | `--touch-min` 48 px, `--touch-lg` 56 px (consola en vivo), `--touch-xl` 64 px. |

---

## 9. Limitaciones conocidas y roadmap

### Limitaciones de esta versión

| Limitación | Detalle |
|------------|---------|
| Sin pruebas E2E de navegador | Las pruebas cubren el núcleo (dominio, casos de uso, hooks puros, datos de demostración). La interfaz no tiene pruebas automatizadas en navegador. |
| Entretiempo no gestionado | El estado `HALFTIME` existe en el modelo, pero la consola no lo activa: el partido sigue "En vivo" entre el 2.º y el 3.er cuarto. |
| Empate tras el 4.º suplementario | Si el reloj llega a 00:00 con empate al final del 4.º suplementario, solo se muestra un aviso. |
| Tiempos muertos al final del partido | No se aplica el máximo de 2 tiempos muertos en los últimos 2 minutos del 4.º cuarto. |
| Dorsal repetido | No se impide que dos jugadores del mismo equipo usen el mismo dorsal. |
| Roles simulados | No hay inicio de sesión. Los permisos solo se aplican en la interfaz. |
| Datos por dispositivo | Cada navegador tiene sus propios datos. No se comparten entre dispositivos. |
| Reinicio sin botón | `resetToSeedData` no está expuesto en la interfaz (ver [sección 7](#volver-a-los-datos-de-demostración)). |

### Roadmap: sincronización con servidor (en desarrollo)

Objetivo: que el sistema siga funcionando sin conexión y además se sincronice con un servidor central.

| Pieza | Decisión |
|-------|----------|
| Base de datos | PostgreSQL (Docker para desarrollo). |
| Acceso | Inicio de sesión real con correo y contraseña (contraseñas con hash, sesión en cookie segura) y roles validados en el servidor. |
| Escritura local primero | Cada cambio se guarda en el navegador y en una cola de salida (outbox) persistente. La cola se envía al servidor cuando hay conexión y se reintenta cuando vuelve. |
| Fusión de datos | Divisiones, equipos, jugadores y datos del partido: gana la última escritura según `updatedAt` (LWW). Jugadas: solo se agregan, por ID, y nunca se sobrescriben. |
| Tiempo real | Envío en vivo de cambios a otros dispositivos con Server-Sent Events (SSE). |

Nada de esto está disponible todavía. Este manual se actualizará cuando se incorpore.

---

## 10. Arquitectura

### Capas (Clean Architecture)

| Capa | Carpeta | Contenido |
|------|---------|-----------|
| Dominio | `src/core/domain/` | Entidades y esquemas Zod (`entities/`), objetos de valor (`value-objects/coordinates.ts`) y reglas puras (`rules/`): FIBA, derivaciones del partido, reloj, tiempos muertos, convocatoria, analítica de temporada y permisos. Sin React ni Zustand. |
| Aplicación | `src/core/application/` | Casos de uso puros (`use-cases/`: entra un estado, sale uno nuevo o un rechazo tipado), el store `useClubStore` con su estado persistido y migración (`stores/`) y hooks (`hooks/`): `useLiveMatchConsole`, `useGameClock` y su lógica pura testeable. |
| Infraestructura | `src/core/infrastructure/` | Datos de demostración determinísticos (`mocks/`: semilla, generador de jugadas, PRNG). |
| Presentación | `src/presentation/` y `src/app/` | Diseño atómico (`atoms/`, `molecules/`, `organisms/`, `templates/`), movimiento (`motion/`), diálogos (`organisms/DialogHost/`), marca (`brand.ts`) y tamaños de icono (`icon-sizes.ts`). Las rutas viven en `src/app/` (App Router de Next.js). |

### Regla de dependencias

Las dependencias apuntan hacia adentro: presentación usa aplicación y dominio; aplicación usa dominio; dominio no importa nada de las otras capas. Los casos de uso reciben el ID y la hora desde afuera (`UseCaseContext`), así que son determinísticos y se prueban sin mocks. El store solo orquesta: busca el partido, ejecuta el caso de uso y guarda el resultado si fue exitoso.

### Árbol resumido

```text
src/
  app/                      rutas: /, /divisions, /players, /matches,
                            /matches/live, /matches/[id]/{lineup,live,stats}
  core/
    domain/                 entities/, rules/, value-objects/
    application/            use-cases/, stores/, hooks/
    infrastructure/mocks/   seed-data.ts, play-by-play-generator.ts, prng.ts
    testing/fixtures.ts     fixtures compartidas de las pruebas
  presentation/
    atoms/ molecules/ organisms/ templates/
    motion/                 useMotion, usePageEnter, useNavIndicator
public/brand/               escudo del club
```

### Diálogos

`notify({ title, message, tone })` y `confirm({ title, message, confirmLabel, tone })`, que devuelve `Promise<boolean>`, viven en `src/presentation/organisms/DialogHost/dialog-store.ts`. Encolan pedidos que `<DialogHost />` (montado una vez en `src/app/layout.tsx`) muestra de a uno sobre `ModalSheet`. Los tonos son `info`, `success`, `warning` y `danger`.

### Cómo agregar un tipo de jugada

1. Agregar el valor a `PlayByPlayEventTypeSchema` y su etiqueta a `PLAY_BY_PLAY_EVENT_LABELS` (`src/core/domain/entities/match.types.ts`).
2. Si suma puntos o cuenta como falta, actualizar `EVENT_POINTS` o `isFoulEvent` (`src/core/domain/rules/event-rules.ts`).
3. Si aparece en el box score, contarlo en `calculatePlayerBoxScore` y `calculateTeamBoxScore` (`basketball-rules.ts`).
4. Exponerlo en la interfaz: botón en `PAD_GROUPS` (`QuickActionPad.tsx`) o en la barra de la consola.
5. Pruebas en `src/core/domain/rules/*.test.ts` y, si cambia un caso de uso, en `src/core/application/use-cases/match-use-cases.test.ts`.
6. Si cambia la forma de los datos guardados, subir `CLUB_STORE_VERSION`.

### Cómo agregar o cambiar una regla

1. Escribir la regla como función pura en `src/core/domain/rules/` y exportarla desde `rules/index.ts`.
2. Escribir primero su prueba en un archivo `*.test.ts` junto a ella.
3. Usarla desde un caso de uso en `src/core/application/use-cases/` (con su prueba) y, si hace falta, desde un hook.
4. Las pantallas solo leen el resultado: no deben recalcular reglas por su cuenta.

### Estrategia de pruebas

- Runner: `node:test` con `node:assert`, ejecutado por `tsx` (`npm test`). Los archivos `*.test.ts` viven junto al código que prueban.
- Cubren: reglas FIBA (faltas, bonus, PIR, +/-, box score), reloj y períodos, tiempos muertos, convocatoria, permisos, clasificación de jugadas, esquemas, derivación del marcador y parciales, analítica de temporada, casos de uso de club y de partido, estado del store y migración, reducer del reloj, reglas de la consola, efectividad de tiros, integridad e identidad de los datos de demostración.
- No cubren: componentes React ni flujos en navegador.
- Controles de calidad antes de integrar: `npx tsc --noEmit`, `npm run lint`, `npm test` y `npm run build`.

---

## 11. Glosario

| Término | Significado |
|---------|-------------|
| PIR / VAL | Valoración FIBA (Performance Index Rating). Fórmula en la [sección 6](#6-reglas-fiba-aplicadas). |
| +/- | Diferencia de puntos del equipo mientras el jugador estuvo en cancha. |
| Bonus | Situación de penalización del equipo con 4 o más faltas de equipo en el período. |
| TL | Tiro libre (1 punto). |
| T2 | Tiro de campo de 2 puntos (doble). |
| T3 | Tiro de campo de 3 puntos (triple). |
| TC | Tiros de campo totales (T2 + T3). |
| REB, AST, ROB, TAP, PER, FAL | Rebotes, asistencias, robos, tapas, pérdidas y faltas. |
| PPG, RPG, APG | Puntos, rebotes y asistencias por partido. |
| TM | Tiempo muerto. |
| 1C a 4C, S1 a S4 | Cuartos y suplementarios. |
| Convocatoria / lista de buena fe | Jugadores habilitados para un partido (5 a 12). |
| Quinteto inicial | Los 5 titulares que empiezan el partido; base del cálculo de +/-. |
| Convocado | Juvenil sumado al plantel de otro equipo (por ejemplo, Primera) sin dejar su división. |
| Jugada a jugada (play-by-play) | Lista ordenada de jugadas del partido; fuente única del marcador y las estadísticas. |
| Offline-first | Diseño en el que la aplicación funciona sin conexión y guarda todo localmente. |
| Outbox (cola de salida) | Cola persistente de cambios pendientes de enviar al servidor (en desarrollo). |
| LWW (last-write-wins) | Estrategia de fusión en la que gana el cambio más reciente según `updatedAt` (en desarrollo). |
| SSE (Server-Sent Events) | Canal del servidor al navegador para avisar cambios en vivo (en desarrollo). |
| RBAC | Control de acceso basado en roles. |
