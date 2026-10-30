# Manual del sistema HoopOS · Club Atlético Monte Grande

HoopOS es el sistema de básquet del Club Atlético Monte Grande (CAMG): divisiones, planteles, calendario de partidos y estadísticas FIBA registradas en vivo desde una tablet al borde de la cancha. Este manual describe el sistema tal como está implementado hoy, primero para quien lo usa y después para quien lo mantiene.

> Estado de esta versión: local primero con servidor. Cada cambio se guarda al instante en el navegador y se sincroniza con un servidor PostgreSQL cuando hay conexión. El acceso es con correo y contraseña, y los roles se validan en el servidor (ver [Datos, persistencia y sincronización](#7-datos-persistencia-y-sincronización) y [Servidor y base de datos](#8-servidor-y-base-de-datos)).

## Índice

1. [Qué es HoopOS](#1-qué-es-hoopos)
2. [Inicio rápido](#2-inicio-rápido)
3. [Roles y permisos](#3-roles-y-permisos)
4. [Guía por pantalla](#4-guía-por-pantalla)
5. [Flujos paso a paso](#5-flujos-paso-a-paso)
6. [Reglas FIBA aplicadas](#6-reglas-fiba-aplicadas)
7. [Datos, persistencia y sincronización](#7-datos-persistencia-y-sincronización)
8. [Servidor y base de datos](#8-servidor-y-base-de-datos)
9. [Identidad visual](#9-identidad-visual)
10. [Limitaciones conocidas](#10-limitaciones-conocidas)
11. [Arquitectura](#11-arquitectura)
12. [Glosario](#12-glosario)

---

## 1. Qué es HoopOS

| Rasgo | Qué significa en la práctica |
|-------|------------------------------|
| Del club | Marca, escudo y paleta del Club Atlético Monte Grande (fundado en 1922). Los datos de demostración corresponden al club. |
| Offline-first | Cada acción se guarda al instante en el navegador. Un corte de WiFi o 4G en el estadio no interrumpe el registro del partido. |
| Sincronizado | Con conexión, los cambios viajan al servidor del club y llegan en vivo a las demás tablets. Sin conexión quedan en una cola y se envían solos cuando vuelve la red. |
| Tablet-first | Pensado para tablet (horizontal o vertical) y teléfono. Áreas táctiles de 48 px como mínimo y de 56 px en la consola en vivo. Registro de jugadas en dos toques. |
| Reglas FIBA | Faltas, bonus, tiempos muertos, duración de períodos, convocatoria, PIR y +/- siguen el reglamento FIBA (detalle en la [sección 6](#6-reglas-fiba-aplicadas)). |
| Sin alertas del navegador | Todos los avisos y confirmaciones son modales propios de la aplicación (`notify` y `confirm`). Nunca se usa `alert`, `confirm` ni `prompt` del navegador. |

---

## 2. Inicio rápido

### Requisitos

- Node.js 20.9 o superior (lo exige Next.js 16; se recomienda la versión LTS vigente). El proyecto no fija `engines` propio en `package.json`.
- npm (incluido con Node.js).
- Docker con Docker Compose, para la base de datos PostgreSQL de desarrollo.

### Puesta en marcha

1. Instalar dependencias: `npm install`
2. Crear `.env.local` a partir de `.env.example` y revisar las variables (ver [Variables de entorno](#variables-de-entorno)). Con los valores por defecto alcanza para desarrollo.
3. Levantar PostgreSQL: `npm run db:up`
4. Crear las tablas: `npm run db:migrate`
5. Cargar el club de demostración y las cuentas: `npm run db:seed`
6. Levantar la aplicación: `npm run dev`
7. Abrir `http://localhost:3000` e iniciar sesión con una [cuenta de demostración](#cuentas-de-demostración) (contraseña por defecto `camg1922`).

### Scripts disponibles

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Servidor de desarrollo de Next.js. |
| `npm run build` | Compilación de producción. |
| `npm run start` | Sirve la compilación de producción (requiere `npm run build` antes). |
| `npm run lint` | ESLint con la configuración de Next.js (`eslint.config.mjs`). |
| `npm test` | Pruebas unitarias (runner `node:test` vía `tsx`): todos los `src/**/*.test.ts` salvo los `*.db.test.ts`. No necesitan base de datos. |
| `npm run test:db` | Pruebas de integración contra PostgreSQL (`*.db.test.ts`). Usan una base aparte (ver [Variables de entorno](#variables-de-entorno)). |
| `npm run db:up` | Levanta PostgreSQL 17 en Docker (`docker compose up -d --wait`). |
| `npm run db:down` | Detiene el contenedor. Los datos quedan en el volumen `hoop-pgdata`. |
| `npm run db:migrate` | Aplica las migraciones SQL versionadas de `drizzle/`. |
| `npm run db:generate` | Genera una migración nueva a partir de `src/server/db/schema.ts` (solo al cambiar el esquema). |
| `npm run db:seed` | Carga el club de demostración y las cuentas. Solo inserta lo que falta (ver [Datos de demostración en el servidor](#datos-de-demostración-en-el-servidor)). |

Control de tipos (no tiene script propio): `npx tsc --noEmit`.

---

## 3. Roles y permisos

Hay tres roles. Cada usuario tiene uno, asignado en el servidor. Cada pantalla oculta o deshabilita lo que el rol no puede hacer, usando la matriz de `src/core/domain/rules/permissions.ts` (función `can(role, permission)`). El servidor aplica la misma matriz a cada cambio que recibe, así que un permiso no se puede saltear desde el navegador.

### Matriz de permisos

| Permiso | Qué habilita | Administrador | Entrenador principal | Asistente planillero |
|---------|--------------|:-------------:|:--------------------:|:--------------------:|
| `MANAGE_DIVISIONS` | Crear, editar y eliminar divisiones; asignar entrenador | Sí | No | No |
| `MANAGE_PLAYERS` | Crear, editar y eliminar jugadores; convocar juveniles a Primera | Sí | Sí | No |
| `MANAGE_MATCHES` | Crear, editar y eliminar partidos programados | Sí | Sí | No |
| `MANAGE_LINEUP` | Armar convocatoria y quinteto; iniciar el partido | Sí | Sí | No |
| `RECORD_LIVE` | Usar la consola en vivo: reloj, períodos, jugadas, cambios, tiempos muertos, finalizar | Sí | Sí | Sí |

Lo que cualquier rol puede ver: dashboard, listado de divisiones y su plantel ("Ver plantel"), jugadores, calendario, convocatorias (en modo lectura) y planillas estadísticas. Sin `RECORD_LIVE` la consola se abre en modo lectura con un aviso.

### Cuentas de demostración

El rol sale de la cuenta con la que se inicia sesión. `npm run db:seed` crea estas cuentas, todas con la contraseña de `SEED_DEMO_PASSWORD` (por defecto `camg1922`):

| Rol | Usuario | Correo |
|-----|---------|--------|
| Administrador | Alejandro Montecchia | `admin@camg.com.ar` |
| Entrenador principal | Federico Balbi | `fbalbi@camg.com.ar` |
| Entrenador principal | Sergio Hernández | `shernandez@camg.com.ar` |
| Entrenador principal | Julio Lamas | `jlamas@camg.com.ar` |
| Asistente planillero | Mariano Ginóbili | `mginobili@camg.com.ar` |

Para usar otro rol hay que cerrar sesión y entrar con otra cuenta. Si el rol de una cuenta cambia en el servidor, la aplicación lo toma la próxima vez que confirma la sesión con conexión.

> Cambiar la contraseña de demostración antes de usar el sistema fuera de un entorno de prueba: definir `SEED_DEMO_PASSWORD` y volver a correr `npm run db:seed`.

---

## 4. Guía por pantalla

### Navegación general

| Elemento | Dónde | Función |
|----------|-------|---------|
| Riel lateral (tablet) | Izquierda | Escudo y marca (vuelve al inicio), Dashboard, Divisiones, Jugadores, Partidos, botón **Partido en vivo** y, al pie, el menú de usuario: nombre, rol, botón de tema claro/oscuro, [estado de sincronización](#estado-de-sincronización) y **Cerrar sesión**. |
| Barra superior (teléfono) | Arriba | Escudo y marca (vuelve al inicio) y el estado de sincronización compacto. |
| Barra inferior (teléfono) | Abajo | Inicio, Equipos, botón central de partido en vivo (icono `Radio`), Plantel y Fechas. |
| Menú de usuario (teléfono) | Cabecera del Dashboard | Nombre, rol, estado de sincronización y **Cerrar sesión**. |
| Diálogos | Sobre la pantalla | Modales propios: avisos (`notify`, botón "Entendido") y confirmaciones (`confirm`, botones "Cancelar" y la acción). Se muestran de a uno, en cola. |

### Inicio de sesión (`/login`)

Pantalla con el escudo del club, campos **Email** y **Contraseña** y el botón **Ingresar**.

| Situación | Qué pasa |
|-----------|----------|
| Datos correctos | Entra y vuelve a la pantalla que se había pedido (o al Dashboard). |
| Correo o contraseña incorrectos | Modal "No pudimos iniciar sesión" con el mensaje genérico "Email o contraseña incorrectos" (no revela si el correo existe). |
| Sin conexión | Modal "Sin conexión": el primer ingreso en una tablet necesita llegar al servidor. |
| Campos vacíos o correo mal escrito | El error aparece debajo del campo. |
| Ya hay una sesión guardada en la tablet | Botón **Continuar como \<nombre\>** para volver sin escribir la contraseña. |

Cualquier otra pantalla, sin una sesión guardada, redirige a `/login` y después vuelve a la pantalla pedida.

### Estado de sincronización

Botón visible en el riel lateral (tablet), en la barra superior (teléfono), en el menú de usuario del Dashboard y en la barra de herramientas de la consola en vivo. Tocarlo sincroniza en ese momento; en una pestaña secundaria le pide a la pestaña principal que sincronice.

| Estado | Icono | Significado |
|--------|-------|-------------|
| Sincronizado | `Cloud` | Todo está en el servidor. Muestra hace cuánto fue la última sincronización. |
| Sincronizando | `RefreshCw` (gira) | Enviando o recibiendo cambios, o hay cambios pendientes por salir en instantes. |
| Sin conexión | `CloudOff` | No hay red o el servidor no responde. Muestra cuántos cambios esperan en la cola ("3 pendientes"). La aplicación sigue funcionando igual. |
| Error | `AlertTriangle` | El servidor rechazó cambios o respondió con un error. Muestra el motivo y "Toca para reintentar". |

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
| Barra de herramientas | **Partidos** (volver), acciones del rival (**+1**, **+2**, **+3**, **Falta**), estado de sincronización (compacto), **Planilla** y **Finalizar**. |
| En cancha / Banca | Tarjetas de jugador con puntos y faltas. Tocar un jugador en cancha lo selecciona. Botón **Cambio** para sustituciones. Los excluidos por faltas aparecen en la banca marcados "Excluido". |
| Media cancha | Tocar la posición registra un tiro del jugador seleccionado. Muestra los tiros con ubicación (círculo: convertido; cruz: fallado). |
| Últimas jugadas | Las 6 jugadas más recientes, de la más nueva a la más vieja, con el botón **Deshacer**. |
| Acciones rápidas | Grupos **Convertidos** (`+1 TL`, `+2`, `+3`), **Fallados** (`TL`, `2P`, `3P`), **Rebotes y juego** (Reb. ofensivo, Reb. defensivo, Asistencia, Robo, Tapa, Pérdida) y **Faltas** (Personal, Técnica, Antidep.). |

**Entretiempo.** Al terminar el 2.º cuarto el partido pasa a **Entretiempo**: el tablero muestra "Entretiempo" en lugar del reloj, un aviso indica que no se registran jugadas ni tiempos muertos y el botón **Comenzar 3.er cuarto** reanuda el partido (3.er cuarto, reloj en 10:00, En vivo). Desde el entretiempo también se puede finalizar el partido.

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

### Iniciar sesión

1. Abrir HoopOS. Sin una sesión guardada aparece la pantalla de inicio de sesión.
2. Escribir el correo y la contraseña de la cuenta y pulsar **Ingresar**.
3. La primera vez en una tablet, la aplicación descarga todos los datos del servidor y reemplaza los datos de demostración que traía el navegador.

Después del primer ingreso, la tablet abre aunque no haya conexión: guarda el perfil del último usuario (nunca la contraseña ni la sesión).

### Cerrar sesión

1. Pulsar **Cerrar sesión** en el menú de usuario.
2. Si hay cambios pendientes, la aplicación intenta enviarlos primero.
3. Si no puede (por ejemplo, sin conexión), un modal avisa "Hay N cambios sin sincronizar. Si cierras sesión ahora, se perderán en este dispositivo." con las opciones **Seguir conectado** y **Cerrar sesión igual**.
4. Al cerrar sesión se borran de la tablet la sesión, el perfil guardado y la cola de cambios. El próximo ingreso vuelve a descargar todo del servidor.
5. Sin conexión la sesión se cierra igual en la tablet, pero el servidor no se entera: un aviso explica que la sesión del servidor sigue activa hasta que venza (30 días) o hasta el próximo inicio de sesión en esa tablet, que la revoca. La cookie queda en el navegador hasta entonces, así que en una tablet compartida conviene cerrar sesión con conexión.

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
2. Confirmar en el modal, que indica cuántos quedan en la mitad, en el suplementario o en los últimos 2 minutos del 4.º cuarto.
3. El reloj se detiene y un aviso muestra los tiempos restantes. Sin tiempos disponibles, el modal "Sin tiempos muertos" lo informa y no se descuenta nada.
4. Con el reloj del 4.º cuarto en 2:00 o menos, cada equipo puede usar como máximo 2 tiempos muertos (FIBA): si le quedaban 3, el botón muestra 2 y el tercero se pierde.
5. Durante el entretiempo no se pueden pedir tiempos muertos.

### Reloj y cambio de período

- **-10s** y **+10s** corrigen el reloj, siempre dentro de la duración del período.
- Tocar otro período en el selector pide confirmación, reinicia el reloj (10:00 o 05:00) e informa si las faltas de equipo vuelven a cero o se mantienen. Pasar del 2.º al 3.er cuarto lleva primero al entretiempo.
- Los suplementarios se habilitan de a uno desde el 4.º cuarto.
- Cuando el reloj llega a 00:00:
  - En el 1.º y el 3.er cuarto: el sistema ofrece pasar al período siguiente.
  - En el 2.º cuarto: ofrece pasar al entretiempo; desde ahí, **Comenzar 3.er cuarto**.
  - Al final del 4.º cuarto o de un suplementario, sin empate: ofrece finalizar el partido.
  - Con empate: ofrece el siguiente suplementario. Si el empate llega al final del 4.º suplementario, solo muestra un aviso.

### Puntos y faltas del rival

El rival no tiene jugadores cargados. En la barra de herramientas, **+1**, **+2** y **+3** suman puntos al rival, y **Falta** registra una falta de equipo del rival (enciende sus luces y su **Bonus**).

### Deshacer

**Deshacer** (en Últimas jugadas) elimina la última jugada registrada, sea propia o del rival. Si era un cambio, revierte el quinteto en cancha. El marcador y las faltas se recalculan desde las jugadas, así que deshacer funciona aunque la jugada sea de un período anterior. Los tiempos muertos y los cambios de período no son jugadas y no se deshacen con este botón.

Con varias tablets en el mismo partido, **Deshacer** quita la última jugada de la lista, que puede haber cargado otra tablet. La jugada no se borra del servidor: queda marcada como eliminada y desaparece también en las demás tablets (ver [Sincronización](#sincronización)).

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
| Tiempos muertos | 2 en la primera mitad, 3 en la segunda y 1 por cada suplementario. Los no usados no pasan a la mitad siguiente. Al entrar a un suplementario nuevo se repone 1. Con el reloj del 4.º cuarto en 2:00 o menos, como máximo 2 (Art. 18.2.5): si quedaban 3, uno se pierde. | `timeouts.ts` (`isLastTwoMinutesOfFourthQuarter`) |
| Entretiempo | Al terminar el 2.º cuarto el partido pasa a `HALFTIME`: no se registran jugadas, cambios ni tiempos muertos hasta comenzar el 3.er cuarto. | `match-use-cases.ts` (`startHalftime`, `startThirdQuarter`) |
| Duración de períodos | 10 minutos por cuarto, 5 por suplementario, hasta 4 suplementarios. | `game-clock.ts` |
| Convocatoria | Entre 5 y 12 jugadores, exactamente 5 titulares y todos ellos convocados. | `lineup-rules.ts` |
| Valoración (PIR) | `(PTS + REB + AST + ROB + TAP) - (tiros de campo fallados + tiros libres fallados + PER + faltas cometidas)`. Cuenta todas las faltas del jugador. | `calculateFibaPir` |
| +/- | Diferencia de puntos mientras el jugador estuvo en cancha. Parte del quinteto inicial (`startingLineupOwn`) y sigue cada cambio propio en orden. | `calculatePlayerPlusMinus`, `getStartingLineup` |
| Doble o triple | Arco de triple a 6,75 m del aro (radio de 235 unidades sobre una media cancha SVG de 500 x 470). En las esquinas, la zona de triple es la franja junto a la línea lateral cerca de la línea de fondo. | `HalfCourtShotChart.tsx` (`isThreePointSpot`) |

Fuente única de verdad: el marcador, las faltas de equipo, los parciales y el box score se derivan siempre de la lista de jugadas del partido (`match-derivations.ts`). Los campos guardados en el partido son una copia que se recalcula en cada cambio.

---

## 7. Datos, persistencia y sincronización

### Dónde se guardan

| Dato | Ubicación |
|------|-----------|
| Divisiones, equipos, jugadores, partidos y jugadas (copia del servidor) | PostgreSQL: tablas `sync_records` y `match_events` (ver [Servidor y base de datos](#8-servidor-y-base-de-datos)). |
| Usuarios y sesiones | PostgreSQL: tablas `users` (contraseñas con hash scrypt) y `sessions` (solo el hash del token). |
| Copia local del club: divisiones, equipos, jugadores, partidos y jugadas, usuario actual, división y partido activos | `localStorage`, clave `hoop-club-storage` (Zustand con el middleware `persist`). |
| Cola de cambios pendientes (outbox), usuario dueño de esa cola, cursor de sincronización, versiones y hora de la última sincronización | `localStorage`, clave `hoop-sync-storage`. |
| Perfil del último usuario (id, correo, nombre, rol) | `localStorage`, clave `hoop-auth-storage`. Nunca la contraseña ni el token. |
| Sesión | Cookie `hoop_session` (httpOnly: el JavaScript de la página no puede leerla), 30 días. |
| Tema claro u oscuro | `localStorage`, clave `hoop-theme`. |
| Cola de diálogos, estado del reloj en marcha, estado de la sincronización en curso | Memoria (no se guarda). |

El reloj de juego se guarda en el partido al pausar, al corregirlo, al llegar a 00:00, con cada jugada, cambio, tiempo muerto o finalización, al ocultarse la página y al salir de la consola.

### Versión y migración

El almacenamiento lleva una versión (`CLUB_STORE_VERSION = 3`, en `src/core/application/stores/club-state.ts`). Si el navegador tiene datos de una versión anterior, se descartan y se cargan los datos de demostración actuales en lugar de fallar. Cada cambio en la forma de los datos guardados debe subir esa versión.

La cola de sincronización (`SYNC_STORE_VERSION`, en `useSyncStore.ts`) y el perfil guardado (`AUTH_STORE_VERSION`, en `useAuthStore.ts`) tienen su propia versión. Con una versión vieja, la cola vuelve a empezar sin cursor (la próxima sincronización descarga todo del servidor) y el perfil se descarta (hay que volver a iniciar sesión). La versión 1 de la cola no guardaba dueño: se conserva y queda a nombre del próximo usuario que inicia sesión.

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

Los mismos datos cargan el servidor con `npm run db:seed`. El navegador los usa solo hasta el primer ingreso: en la primera sincronización de una tablet, la copia del servidor reemplaza los datos locales de demostración (nunca se envían al servidor). Los cambios que alguien haya hecho antes de esa primera sincronización no se pierden: se vuelven a aplicar sobre la copia del servidor y se envían.

### Volver a los datos del servidor en una tablet

La fuente de verdad es el servidor. Para que una tablet descarte su copia local y vuelva a descargar todo:

1. Esperar a que el estado diga **Sincronizado** (si no, los cambios pendientes se pierden).
2. Pulsar **Cerrar sesión** y volver a iniciar sesión: la primera sincronización descarga todo de nuevo.

Como alternativa, en las herramientas de desarrollo del navegador se pueden borrar las claves `hoop-club-storage` y `hoop-sync-storage` de `localStorage` y recargar. No hay un botón para reiniciar la copia local.

### Sincronización

Cómo funciona para quien usa la aplicación:

| Situación | Qué hace HoopOS |
|-----------|-----------------|
| Cualquier cambio (crear un jugador, registrar una jugada, mover el reloj) | Se guarda al instante en la tablet y entra en la cola de salida. Medio segundo después se envía al servidor. |
| Sin conexión | Todo sigue funcionando igual. El estado muestra **Sin conexión** y cuántos cambios esperan. La cola se guarda en el navegador y sobrevive a recargas y reinicios. |
| Cambios antes de la primera sincronización (tablet nueva o sin conexión desde el primer ingreso) | También entran en la cola y el estado los cuenta como pendientes. Cuando llega la primera copia completa del servidor, reemplaza los datos locales y los cambios pendientes se vuelven a aplicar encima; después se envían. |
| Vuelve la conexión | La cola se envía sola y la tablet descarga lo que cambiaron las demás. Si el servidor no responde, reintenta cada vez más espaciado (1 s, 2 s, 4 s... hasta 60 s). |
| Otra tablet guarda un cambio | El servidor avisa en vivo (Server-Sent Events) y esta tablet lo descarga en segundos. |
| Dos tablets editan el mismo jugador o división | Gana el cambio más reciente según la hora en que se hizo (last-write-wins) y el registro se reemplaza completo. |
| Dos tablets editan el mismo partido | Se combinan campo por campo: cada dato del partido (estado, período, reloj, tiempos muertos, quinteto, estadio, etc.) guarda la hora de su último cambio y gana el más reciente; con la misma hora queda el del servidor. Si una tablet maneja el reloj y otra corrige el estadio, se conservan los dos cambios. Eliminar un partido gana solo si es posterior a todos sus cambios. |
| Varias pestañas abiertas en el mismo navegador | Solo una pestaña (la principal) sincroniza y guarda los datos en el navegador. Las demás muestran lo que guarda la principal y le envían sus cambios al instante. Si se cierra la principal, otra pestaña toma su lugar sola, sin perder cambios. |
| Jugadas | Nunca se pisan: cada jugada tiene su propio ID y se suma a la lista, ordenada por hora y luego por ID. Dos tablets pueden cargar jugadas del mismo partido a la vez sin perder ninguna. El marcador y las faltas se recalculan con todas. |
| **Deshacer** una jugada | La jugada queda marcada como eliminada en el servidor (no se borra) y desaparece en todas las tablets. Una jugada eliminada no vuelve. |
| El servidor rechaza un cambio | Si el rol no tiene permiso o el dato no es válido, el cambio se descarta y el estado muestra **Error** con la cantidad de cambios rechazados. Si el servidor tiene una versión más nueva, se descarta el cambio local y se descarga la del servidor. |
| Jugadas de un partido que el servidor no tiene | El servidor las rechaza: una jugada solo se acepta si su partido existe (o llega en el mismo envío) y no está eliminado. La tablet envía siempre el partido antes que sus jugadas. |
| La sesión venció | La aplicación pide iniciar sesión de nuevo. Si vuelve a entrar la misma cuenta, la cola se conserva y se envía después del ingreso. |
| Otra persona inicia sesión en la misma tablet | La cola guarda quién hizo los cambios. Si entra una cuenta distinta, los cambios pendientes de la anterior se descartan (nunca se envían con la identidad de otra persona), un aviso informa "Se descartaron N cambios sin sincronizar de <nombre>" y la tablet descarga todo de nuevo del servidor. |
| Se reinició la base del servidor | Cuando la tablet detecta que el servidor volvió atrás (con el próximo envío o aviso en vivo), descarga todo de nuevo, reemplaza su copia y vuelve a aplicar encima los cambios pendientes, que se envían a continuación. |

Detalle técnico:

- La aplicación compara el estado anterior y el nuevo del store para detectar entidades creadas, editadas o eliminadas y jugadas nuevas o eliminadas. A cada registro le pone `updatedAt` (hora del cambio, siempre posterior a la versión anterior de ese registro) y lo guarda en la cola: un solo cambio pendiente por registro (`tipo:id`) y por jugada. En un partido se marcan con esa hora solo los campos que cambiaron (`fieldVersions`); el marcador y las faltas no se versionan porque se recalculan desde las jugadas.
- Fusión por campo de partidos (`src/core/application/sync/match-fields.ts`): la misma función se usa en el servidor al recibir y en la tablet al descargar. Los registros sin versiones por campo (anteriores a esta versión) cuentan con `updatedAt` en todos los campos.
- Una sola pestaña sincroniza (`tab-coordinator.ts`): elección con el Web Lock `hoop-sync-leader`; las demás pestañas no escriben `hoop-club-storage` ni `hoop-sync-storage`, los recargan con el evento `storage` y envían sus cambios por `BroadcastChannel` hasta que la principal los confirma. Sin Web Locks (por ejemplo, la aplicación servida por http en la red local) o sin `BroadcastChannel`, cada pestaña sincroniza por su cuenta.
- Un envío (`POST /api/sync/push`) lleva como máximo 500 registros y 2000 jugadas. Una eliminación viaja como marca (tombstone) con los últimos datos conocidos. Los partidos viajan sin jugadas; las jugadas van aparte.
- La descarga (`GET /api/sync/pull?since=<cursor>`) trae todo lo que cambió después del cursor, de a páginas, y se aplica una sola vez al final. Lo descargado no vuelve a entrar en la cola.
- Sin cursor (primera sincronización o reinicio de la base) primero se descarga la copia completa y después se envía la cola. La copia reemplaza los datos locales y la cola se vuelve a aplicar encima (`applyServerSnapshot`): registros pendientes creados, editados o eliminados, jugadas nuevas agregadas y jugadas eliminadas quitadas; luego se recalculan los marcadores. Un registro pendiente del que el servidor ya tiene una versión igual o más nueva se descarta, igual que en una descarga normal.
- La cola tiene dueño (`owner`: id y nombre del usuario). Antes de arrancar la sincronización, `resolveSyncOwnership` (en `src/core/application/sync/sync-owner.ts`) decide: sin dueño o mismo usuario, la cola se conserva; otro usuario, se vacían cola, cursor y versiones.
- Código: `src/core/application/sync/` (núcleo puro y probado), `src/core/infrastructure/sync-api/` (llamadas HTTP y SSE validadas con Zod) y `src/presentation/session/` (arranque, sesión y cierre de sesión).

---

## 8. Servidor y base de datos

El servidor es la propia aplicación Next.js: las rutas `src/app/api/**` atienden el inicio de sesión y la sincronización, y el código de servidor vive en `src/server/**` (nunca llega al navegador). Los datos están en PostgreSQL 17.

### Base de datos con Docker

| Paso | Comando |
|------|---------|
| Levantar PostgreSQL (contenedor `db`, volumen `hoop-pgdata`, puerto solo en `127.0.0.1`) | `npm run db:up` |
| Crear o actualizar las tablas | `npm run db:migrate` |
| Cargar el club de demostración y las cuentas | `npm run db:seed` |
| Correr las pruebas de integración | `npm run test:db` |
| Detener el contenedor (los datos quedan en el volumen) | `npm run db:down` |

### Variables de entorno

Se definen en `.env.local` (no se sube al repositorio; `.env.example` documenta los valores por defecto). Las variables del sistema tienen prioridad.

| Variable | Para qué | Valor por defecto o ejemplo |
|----------|----------|-----------------------------|
| `DATABASE_URL` | Conexión de la aplicación, las migraciones y el seed. Obligatoria. | `postgres://hoop:hoop@127.0.0.1:5432/hoop` |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` | Base, usuario, contraseña y puerto local del contenedor de `docker-compose.yml`. Deben coincidir con `DATABASE_URL`. | `hoop`, `hoop`, `hoop`, `5432` |
| `SEED_DEMO_PASSWORD` | Contraseña de las cuentas de demostración que crea `npm run db:seed`. | `camg1922` |
| `TEST_DATABASE_URL` | Base de `npm run test:db`. Si falta, se usa `DATABASE_URL` con `_test` al final del nombre (por ejemplo `hoop_test`), que se crea sola. Nunca toca los datos de desarrollo. | `postgres://hoop:hoop@127.0.0.1:5432/hoop_test` |
| `SESSION_COOKIE_SECURE` | Fuerza el atributo `Secure` de la cookie de sesión: `true` o `false`. Sin definir, es seguro en producción y no en desarrollo. Poner `false` cuando las tablets entran a una compilación de producción por `http` en la red del club (por ejemplo `http://192.168.0.10:3000`): el navegador descarta las cookies `Secure` en `http` y el inicio de sesión no quedaría guardado. Solo en una red de confianza; detrás de HTTPS dejar el valor por defecto. | sin definir |

### Datos de demostración en el servidor

`npm run db:seed` carga el mismo club de demostración de la [sección 7](#datos-de-demostración) y las [cuentas de demostración](#cuentas-de-demostración). Con los datos del club solo inserta: nunca sobrescribe ni revive registros o jugadas que ya existen (tampoco los que alguien eliminó), así que se puede correr varias veces sin pisar lo cargado por los usuarios. Al terminar informa cuántos registros y jugadas nuevos insertó (`recordsInserted`, `eventsInserted`) y lista las cuentas. Las cuentas de demostración, en cambio, se actualizan por ID: cada corrida restablece su nombre, correo y rol, y su contraseña a la de `SEED_DEMO_PASSWORD`.

### API

| Ruta | Qué hace |
|------|----------|
| `POST /api/auth/login` | `{ email, password }` en JSON. Responde `{ user }` y crea la cookie de sesión, o 401 con "Email o contraseña incorrectos". |
| `POST /api/auth/logout` | Cierra la sesión y borra la cookie. Exige `Content-Type: application/json` (cuerpo `{}`); sin él responde 415. |
| `GET /api/auth/me` | El usuario de la sesión (`id`, `email`, `name`, `role`) o 401. |
| `POST /api/sync/push` | Recibe registros (los partidos con `fieldVersions` opcional: campo -> hora de su último cambio) y jugadas; responde `{ accepted, rejected: [{ id, reason }], cursor }`. |
| `GET /api/sync/pull?since=<cursor>` | Cambios posteriores al cursor (incluye eliminaciones), de a páginas (`hasMore`). Sin `since`, todo. |
| `GET /api/sync/stream` | Server-Sent Events: `event: changed` con el cursor nuevo tras cada escritura aceptada, y un latido cada 25 s. |

Motivos de rechazo de un cambio en `push`: `INVALID` (datos que no cumplen el esquema del dominio, un `updatedAt` más de 5 minutos adelantado respecto del reloj del servidor, una versión de campo posterior a su `updatedAt`, o una jugada cuyo partido no existe en el servidor ni llega aceptado en el mismo envío), `FORBIDDEN` (el rol no tiene el permiso) y `STALE` (el servidor ya tiene una versión igual o más nueva de todos los campos, o la jugada fue eliminada).

### Seguridad

- Contraseñas con hash scrypt y sal aleatoria; la sesión es un token aleatorio del que el servidor solo guarda el hash.
- Cookie `hoop_session` httpOnly, `SameSite=Lax`, `Secure` en producción (ver `SESSION_COOKIE_SECURE`).
- Mensaje genérico ante credenciales incorrectas: no revela qué correos existen.
- `login`, `logout` y `push` exigen JSON y rechazan con 403 ("Solicitud rechazada: el origen no está permitido.") los pedidos cuyo encabezado `Origin` no coincide con el host del servidor. Detrás de un proxy inverso, el proxy debe enviar `X-Forwarded-Host` (o conservar `Host`).
- Los permisos de cada cambio se validan en el servidor con la misma matriz de roles que usa la interfaz.
- `updatedAt` más de 5 minutos en el futuro se rechaza, para que un reloj adelantado no gane todos los conflictos.

### Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---------|----------------|-----------|
| Después de ingresar, la tablet vuelve a la pantalla de inicio de sesión | Compilación de producción servida por `http`: el navegador descarta la cookie `Secure`. | Definir `SESSION_COOKIE_SECURE=false` (solo en la red del club) o servir por HTTPS. |
| El estado queda en **Sin conexión** con conexión | El servidor no responde o no llega a la base. | Revisar que la aplicación esté corriendo, `npm run db:up` y `DATABASE_URL`. |
| "Sin conexión" al iniciar sesión | El primer ingreso necesita el servidor. | Conectar la tablet a la red del club. |
| Después de ingresar no hay divisiones ni partidos | La base está vacía. | `npm run db:migrate` y `npm run db:seed`. |
| **Error**: "El servidor rechazó N cambios" | El rol no tiene permiso, el dato no es válido o el reloj de la tablet está más de 5 minutos adelantado. | Revisar el rol de la cuenta y activar la fecha y hora automáticas en la tablet. |
| 403 "Solicitud rechazada: el origen no está permitido." | Un proxy cambia el `Host` sin enviar `X-Forwarded-Host`. | Configurar el proxy para conservar el host original. |
| Una tablet no ve cambios de otra | El canal en vivo se cortó. | Tocar el estado de sincronización para descargar; el canal se reabre solo. |
| Después de reiniciar la base, una tablet muestra datos viejos | Todavía no detectó el reinicio (lo hace con el próximo envío o aviso en vivo). | Cerrar sesión y volver a ingresar. |
| `npm run test:db` no conecta | Falta `TEST_DATABASE_URL` o `DATABASE_URL`, o el contenedor no está levantado. | `npm run db:up` y revisar `.env.local`. |

---

## 9. Identidad visual

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

## 10. Limitaciones conocidas

Resueltas en esta versión: los partidos se combinan campo por campo entre tablets, el servidor rechaza jugadas de partidos inexistentes, una sola pestaña sincroniza por navegador, la consola en vivo muestra el estado de sincronización, y el entretiempo y la regla de tiempos muertos de los últimos 2 minutos del 4.º cuarto están implementados.

| Limitación | Detalle |
|------------|---------|
| Sin pruebas E2E de navegador | Las pruebas cubren el núcleo (dominio, casos de uso, hooks puros, sincronización, coordinación de pestañas, datos de demostración) y el servidor. La interfaz no tiene pruebas automatizadas en navegador. |
| Pestañas por http en la red local | La coordinación de pestañas usa Web Locks, que requiere https o `localhost`. Por http en la red local cada pestaña sincroniza por su cuenta: conviene usar una sola. |
| Reinicio de la base | La tablet detecta un reinicio de la base del servidor recién con su próximo envío o aviso en vivo. |
| Cambios rechazados | Un cambio que el servidor rechaza por permiso o validez se descarta y solo se informa la cantidad, no cuál fue. |
| Correcciones en el entretiempo | Durante el entretiempo no se puede deshacer la última jugada del 2.º cuarto: hay que comenzar el 3.er cuarto primero. |
| Empate tras el 4.º suplementario | Si el reloj llega a 00:00 con empate al final del 4.º suplementario, solo se muestra un aviso. |
| Dorsal repetido | No se impide que dos jugadores del mismo equipo usen el mismo dorsal. |
| Usuarios sin pantalla de gestión | Las cuentas se crean con `npm run db:seed`. No hay pantalla para crear usuarios ni cambiar contraseñas. |
| Cambio de usuario sin conexión | Si otra cuenta entra en la tablet sin conexión, se descarta la cola de la anterior, pero sus cambios siguen a la vista hasta que llega la copia completa del servidor. |
| Cierre de sesión sin conexión | La sesión del servidor sigue válida hasta que vence (30 días) o hasta el próximo ingreso en esa tablet. La aplicación lo avisa al cerrar sesión. |
| Cierre de sesión con varias pestañas | Cerrar sesión en una pestaña no cierra las demás al instante: la pestaña principal pide iniciar sesión con su próximo envío al servidor. |

---

## 11. Arquitectura

### Capas (Clean Architecture)

| Capa | Carpeta | Contenido |
|------|---------|-----------|
| Dominio | `src/core/domain/` | Entidades y esquemas Zod (`entities/`), objetos de valor (`value-objects/coordinates.ts`) y reglas puras (`rules/`): FIBA, derivaciones del partido, reloj, tiempos muertos, convocatoria, analítica de temporada y permisos. Sin React ni Zustand. |
| Aplicación | `src/core/application/` | Casos de uso puros (`use-cases/`: entra un estado, sale uno nuevo o un rechazo tipado), los stores persistidos `useClubStore`, `useSyncStore` y `useAuthStore` (`stores/`), el motor de sincronización y sus reglas puras (`sync/`: diferencias, cola de salida, fusión de lo descargado), la sesión del cliente (`auth/`) y hooks (`hooks/`): `useLiveMatchConsole`, `useGameClock` y su lógica pura testeable. |
| Infraestructura | `src/core/infrastructure/` | Datos de demostración determinísticos (`mocks/`: semilla, generador de jugadas, PRNG) y adaptadores de la API (`sync-api/`: `fetch` y `EventSource`, con respuestas validadas por Zod). |
| Presentación | `src/presentation/` y `src/app/` | Diseño atómico (`atoms/`, `molecules/`, `organisms/`, `templates/`), movimiento (`motion/`), diálogos (`organisms/DialogHost/`), sesión (`session/`: `SessionProvider` montado en el layout, arranque del motor y cierre de sesión), marca (`brand.ts`) y tamaños de icono (`icon-sizes.ts`). Las rutas viven en `src/app/` (App Router de Next.js). |
| Servidor | `src/server/` y `src/app/api/` | Base de datos (Drizzle + `pg`), autenticación y sesiones, RBAC del servidor y sincronización (push, pull, SSE). Marcado `server-only`: nunca se importa desde componentes del cliente. Reutiliza los esquemas y permisos del dominio. |

### Regla de dependencias

Las dependencias apuntan hacia adentro: presentación usa aplicación y dominio; aplicación usa dominio; dominio no importa nada de las otras capas. Los casos de uso reciben el ID y la hora desde afuera (`UseCaseContext`), así que son determinísticos y se prueban sin mocks. El store solo orquesta: busca el partido, ejecuta el caso de uso y guarda el resultado si fue exitoso.

El motor de sincronización (`createSyncEngine`) no conoce el navegador: recibe la API, los stores, la conectividad, el canal SSE y los temporizadores como puertos. `src/presentation/session/sync-runtime.ts` es el único lugar que los conecta.

### Árbol resumido

```text
src/
  app/                      rutas: /, /divisions, /players, /matches,
                            /matches/live, /matches/[id]/{lineup,live,stats}
                            /login, /api/auth/*, /api/sync/*
  core/
    domain/                 entities/, rules/, value-objects/
    application/            use-cases/, stores/, hooks/, sync/, auth/
    infrastructure/         mocks/ (semilla), sync-api/ (fetch, SSE)
    testing/fixtures.ts     fixtures compartidas de las pruebas
  presentation/
    atoms/ molecules/ organisms/ templates/
    motion/                 useMotion, usePageEnter, useNavIndicator
    session/                SessionProvider, sync-runtime, sync-ownership, logout
  server/                   db/, auth/, sync/, http/ (server-only)
drizzle/                    migraciones SQL versionadas
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
- Sincronización del cliente: diferencias entre estados, coalescencia de la cola, límites del envío, resultado del envío (aceptado, `STALE`, `FORBIDDEN`, `INVALID`), fusión last-write-wins, eliminaciones, orden de jugadas, primera sincronización, cambios hechos antes de la primera sincronización, cola reaplicada sobre la copia completa, reinicio del cursor, dueño de la cola al cambiar de usuario, motor (debounce, reintentos con espera creciente, 401, sin conexión, SSE), cierre de sesión sin conexión, destino seguro tras el ingreso, adaptador HTTP y textos del indicador.
- Servidor: hash de contraseñas, sesiones, RBAC, esquemas de la API, reglas de fusión, SSE y, con `npm run test:db`, integración contra PostgreSQL.
- No cubren: componentes React ni flujos en navegador.
- Controles de calidad antes de integrar: `npx tsc --noEmit`, `npm run lint`, `npm test` y `npm run build`.

---

## 12. Glosario

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
| Outbox (cola de salida) | Cola persistente de cambios pendientes de enviar al servidor (`hoop-sync-storage`). |
| LWW (last-write-wins) | Estrategia de fusión en la que gana el cambio más reciente según `updatedAt`. |
| Tombstone (marca de eliminación) | Registro o jugada marcado como eliminado en lugar de borrarse, para que la eliminación llegue a todas las tablets. |
| Cursor | Posición de la última descarga: la siguiente trae solo lo que cambió después. |
| SSE (Server-Sent Events) | Canal del servidor al navegador para avisar cambios en vivo. |
| RBAC | Control de acceso basado en roles. |
| Versión por campo | Hora del último cambio de cada dato de un partido; permite combinar ediciones de distintas tablets sin pisarse. |
| Pestaña principal | La única pestaña del navegador que sincroniza y guarda los datos; las demás le envían sus cambios. |
| Entretiempo | Descanso tras el 2.º cuarto (`HALFTIME`): sin jugadas ni tiempos muertos hasta comenzar el 3.er cuarto. |
