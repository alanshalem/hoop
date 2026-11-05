# Manual del sistema Hoop · Club Atlético Monte Grande

Hoop es el sistema de básquet del Club Atlético Monte Grande (CAMG). Su núcleo es la planilla táctica que el entrenador carga en vivo durante el partido (ver [Planilla táctica](#2-planilla-táctica-en-vivo)); alrededor de ella están las divisiones, los planteles, el calendario de partidos y la página de cada partido (parciales y box score de puntos). La planilla se carga desde una tablet al borde de la cancha. Este manual describe el sistema tal como está implementado hoy, primero para quien lo usa y después para quien lo mantiene.

> Estado de esta versión: local primero con servidor. Cada cambio se guarda al instante en el navegador y se sincroniza con un servidor PostgreSQL cuando hay conexión. El acceso es con correo y contraseña, y los roles se validan en el servidor (ver [Datos, persistencia y sincronización](#8-datos-persistencia-y-sincronización) y [Servidor y base de datos](#9-servidor-y-base-de-datos)).

## Índice

1. [Qué es Hoop](#1-qué-es-hoop)
2. [Planilla táctica (en vivo)](#2-planilla-táctica-en-vivo)
3. [Inicio rápido](#3-inicio-rápido)
4. [Roles y permisos](#4-roles-y-permisos)
5. [Guía por pantalla](#5-guía-por-pantalla)
6. [Flujos paso a paso](#6-flujos-paso-a-paso)
7. [Reglas FIBA aplicadas](#7-reglas-fiba-aplicadas)
8. [Datos, persistencia y sincronización](#8-datos-persistencia-y-sincronización)
9. [Servidor y base de datos](#9-servidor-y-base-de-datos)
10. [Identidad visual](#10-identidad-visual)
11. [Limitaciones conocidas](#11-limitaciones-conocidas)
12. [Arquitectura](#12-arquitectura)
13. [Glosario](#13-glosario)

---

## 1. Qué es Hoop

| Rasgo                     | Qué significa en la práctica                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Del club                  | Marca, escudo y paleta del Club Atlético Monte Grande (fundado en 1922). Los datos de demostración corresponden al club.                                            |
| Planilla táctica          | El núcleo del sistema: la planilla "Sistemas" del entrenador, cargada en vivo en dos toques (pérdidas, puntos recibidos, acciones ofensivas y defensivas). Ver la [sección 2](#2-planilla-táctica-en-vivo). |
| Offline-first             | Cada acción se guarda al instante en el navegador. Un corte de WiFi o 4G en el estadio no interrumpe el registro del partido.                                       |
| Sincronizado              | Con conexión, los cambios viajan al servidor del club y llegan en vivo a las demás tablets. Sin conexión quedan en una cola y se envían solos cuando vuelve la red. |
| Tablet-first              | Pensado para tablet (horizontal o vertical) y teléfono. Áreas táctiles de 48 px como mínimo y de 56 px en la consola en vivo. Registro de jugadas en dos toques.    |
| Reglas FIBA               | Faltas de equipo, bonus, tiempos muertos, duración de períodos y convocatoria siguen el reglamento FIBA (detalle en la [sección 7](#7-reglas-fiba-aplicadas)).      |
| Sin alertas del navegador | Todos los avisos y confirmaciones son modales propios de la aplicación (`notify` y `confirm`). Nunca se usa `alert`, `confirm` ni `prompt` del navegador.           |

---

## 2. Planilla táctica (en vivo)

La planilla táctica es el núcleo de Hoop. Es la planilla de papel "Sistemas" del entrenador llevada a la tablet: durante el partido, en vivo, se anota por qué pasaron las cosas (cómo se perdió cada pelota, por qué se recibió cada canasta, qué tiros se tomaron y cómo defendió el equipo), no solo qué pasó. El marcador, los parciales y el box score complementan a la planilla, pero no la reemplazan.

Cada entrada guarda la categoría, el código, el jugador propio (o **Equipo** si la acción no es de un jugador) y, de forma automática, el período y el reloj del partido en ese momento.

### Cargar la planilla durante el partido

1. Abrir la consola en vivo (`/matches/[id]/live`). La consola es la **Planilla**: no tiene otro modo.
2. Elegir la categoría en las pestañas: **Pérdidas**, **Puntos recibidos**, **Acciones ofensivas** o **Acciones defensivas**.
3. En el paso 1, tocar un jugador o **Equipo**. Aparece toda la convocatoria del partido por igual, ordenada por dorsal: botones del mismo tamaño con dorsal y apellido, sin separar a los que están en cancha. El título del paso cambia con la categoría:
   - **Puntos recibidos**: **1. Responsable (tu jugador)**, el jugador propio responsable de la canasta recibida (el número que se marca con un círculo en la planilla de papel). Los puntos van al marcador del rival; quién convirtió del rival es opcional (ver **Jugador rival (opcional)** más abajo).
   - **Acciones ofensivas**: **1. Quién lanzó**.
   - **Pérdidas** y **Acciones defensivas**: **1. Jugador**.
4. Solo en **Puntos recibidos**: elegir los puntos de la canasta en el selector **Puntos** (**1**, **2** o **3**). Empieza en 2 y vuelve a 2 después de cada entrada.
5. En **2. Acción**, tocar el código. En Pérdidas, Puntos recibidos y Acciones defensivas ese toque registra la entrada. Los códigos quedan deshabilitados hasta elegir un jugador o **Equipo** ("primero elige un jugador o Equipo").
6. Solo en **Acciones ofensivas**: el código queda marcado y aparece **3. Resultado**. Tocar **No convirtió**, **+1**, **+2** o **+3**; ese toque registra la entrada. Ejemplo: Delfino toma un mal lanzamiento y lo convierte de 2: **#9**, **Mal lanzamiento**, **+2**. En la planilla se ve como `#9 R +2` y un fallo como `#9 A +0`.

Son dos toques por entrada (jugador y código), y tres en Acciones ofensivas (jugador, código y resultado). Después de cada entrada la selección de jugador se limpia, así la siguiente empieza de cero. El período y el reloj se toman de la consola; no hace falta escribirlos.

**Jugador rival (opcional).** Si el rival del partido tiene plantel cargado (ver [Planteles rivales](#planteles-rivales)), en **Puntos recibidos** y **Acciones ofensivas** aparece el paso **Rival (opcional)** con un botón por jugador rival (`#7 Domínguez`, ordenados por dorsal). En Puntos recibidos pregunta **¿Quién convirtió?** y está justo antes de **2. Acción**; en Acciones ofensivas indica el **Defensor rival** y está justo antes de **3. Resultado**. No agrega un toque obligatorio: la entrada se sigue guardando con el toque del código (Puntos recibidos) o del resultado (Acciones ofensivas), con el jugador rival si se eligió y sin él si no. Tocar de nuevo el jugador rival elegido lo quita. La elección se limpia después de cada entrada y al cambiar de categoría. Si el rival no tiene plantel, el paso no aparece.

**Últimas entradas** muestra las 5 más recientes, cada una en una tarjeta de dos líneas con el borde y el símbolo en azul o rojo según el tono:

| Parte | Ejemplo | Qué muestra |
| ----- | ------- | ----------- |
| Símbolo | `R` | El símbolo del código, en su color. |
| Primera línea | `#29 Garino` Mal lanzamiento | El jugador propio con dorsal y apellido completo (**Equipo** si la entrada es del equipo) y el nombre del código. |
| Segunda línea | `2C 05:32 · Acciones ofensivas · vs #7 Domínguez` | Período y reloj, la categoría y, solo si se cargó, el jugador rival: `vs #7 Domínguez` en Acciones ofensivas y `convirtió #7 Domínguez` en Puntos recibidos. Si no se cargó el jugador rival, no se muestra nada. |
| Resultado, a la derecha | `+2`, `no convirtió`, `3 pts` | En Acciones ofensivas, los puntos convertidos en verde o **no convirtió**; en Puntos recibidos, los puntos recibidos en rojo. Pérdidas y Acciones defensivas no tienen resultado. |

**Deshacer**, al lado del título, elimina la última entrada de la planilla.

**Cuándo se puede cargar.** Solo con el partido **En vivo**. En el entretiempo el panel queda bloqueado (no se cargan ni se deshacen entradas) hasta **Comenzar 3.er cuarto**. Un partido programado o finalizado no admite entradas. Sin el permiso `RECORD_LIVE` el panel muestra "Tu rol no puede cargar la planilla en vivo."

**Distribución.** Desde 900 px de ancho, el panel de carga y la grilla de la planilla se ven lado a lado. En pantallas más angostas hay dos pestañas: **Cargar** y **Ver planilla**.

### Códigos de la planilla

Cada código tiene un símbolo corto (el que se escribe junto al dorsal en la grilla), una etiqueta y un tono: azul para las acciones positivas y rojo para las negativas, como las tintas de la planilla de papel. Algunos símbolos se repiten en categorías distintas (por ejemplo `RD`, `FI`, `CO` y `PK`); la fila de la grilla y el color los distinguen. El id es el valor que se guarda en cada entrada.

Las tablas siguientes son los códigos de fábrica. Cada club los puede renombrar, completar con códigos propios y archivar (ver [Catálogo del club](#catálogo-del-club)).

**Pérdidas.** Cómo se perdió la pelota (todas negativas). Los tipos siguen los de pérdida del FIBA Statisticians' Manual 2024 (Anexo B). **Violación de tiempo** agrupa 3, 5, 8 y 24 segundos.

| Símbolo | Acción              | Tono            | Id                 |
| ------- | ------------------- | --------------- | ------------------ |
| `P`     | Pase malo           | Rojo (negativa) | `BAD_PASS`         |
| `C`     | Caminos             | Rojo (negativa) | `TRAVELLING`       |
| `DD`    | Doble dribling      | Rojo (negativa) | `DOUBLE_DRIBBLE`   |
| `M`     | Manejo de balón     | Rojo (negativa) | `BALL_HANDLING`    |
| `FO`    | Falta ofensiva      | Rojo (negativa) | `OFFENSIVE_FOUL`   |
| `FI`    | Foul innecesario    | Rojo (negativa) | `UNNECESSARY_FOUL` |
| `T`     | Violación de tiempo | Rojo (negativa) | `TIME_VIOLATION`   |
| `AF`    | Pelota afuera       | Rojo (negativa) | `OUT_OF_BOUNDS`    |
| `?`     | Otra                | Rojo (negativa) | `OTHER`            |

**Puntos recibidos.** Una entrada por cada canasta recibida: por qué entró (todas negativas). Además del código guarda los puntos de la canasta (1, 2 o 3; por defecto 2).

| Símbolo | Acción                  | Tono            | Id                    |
| ------- | ----------------------- | --------------- | --------------------- |
| `CO`    | Corte                   | Rojo (negativa) | `CUT`                 |
| `1x1`   | 1x1                     | Rojo (negativa) | `ONE_ON_ONE`          |
| `RD`    | Sin rebote defensivo    | Rojo (negativa) | `NO_DEF_REBOUND`      |
| `FI`    | Foul innecesario        | Rojo (negativa) | `UNNECESSARY_FOUL`    |
| `PC`    | Pérdida + contra        | Rojo (negativa) | `TURNOVER_FAST_BREAK` |
| `X`     | No puntear tiro         | Rojo (negativa) | `NO_CLOSEOUT`         |
| `NR`    | No rotar                | Rojo (negativa) | `NO_ROTATION`         |
| `NT`    | No transición defensiva | Rojo (negativa) | `NO_TRANSITION_D`     |
| `TM`    | Transición por mal tiro | Rojo (negativa) | `BAD_SHOT_TRANSITION` |
| `PK`    | Pick                    | Rojo (negativa) | `PICK`                |
| `MR`    | Mérito rival            | Rojo (negativa) | `OPPONENT_MERIT`      |

**Acciones ofensivas.** Calidad de los tiros propios.

| Símbolo | Acción            | Tono            | Id            |
| ------- | ----------------- | --------------- | ------------- |
| `A`     | Buen lanzamiento  | Azul (positiva) | `GOOD_SHOT`   |
| `R`     | Mal lanzamiento   | Rojo (negativa) | `BAD_SHOT`    |
| `B`     | Bandeja           | Azul (positiva) | `LAYUP`       |
| `F`     | Forzado permitido | Rojo (negativa) | `FORCED_SHOT` |

**Acciones defensivas.** Trabajo defensivo y de esfuerzo (hustle): en azul lo bien hecho, en rojo las fallas.

| Símbolo | Acción               | Tono            | Id              |
| ------- | -------------------- | --------------- | --------------- |
| `RD`    | Rebote defensivo     | Azul (positiva) | `DEF_REBOUND`   |
| `BR`    | Bloqueo de rebote    | Azul (positiva) | `BOX_OUT`       |
| `AY`    | Ayuda                | Azul (positiva) | `HELP`          |
| `CT`    | Contestar tiro       | Azul (positiva) | `CONTEST`       |
| `RO`    | Rotación             | Azul (positiva) | `ROTATION`      |
| `TD`    | Transición defensiva | Azul (positiva) | `TRANSITION_D`  |
| `PR`    | Presión              | Azul (positiva) | `PRESSURE`      |
| `RB`    | Robo                 | Azul (positiva) | `STEAL`         |
| `DV`    | Desvío               | Azul (positiva) | `DEFLECTION`    |
| `BF`    | Buen foul            | Azul (positiva) | `GOOD_FOUL`     |
| `2O`    | 2da oportunidad      | Rojo (negativa) | `SECOND_CHANCE` |
| `CO`    | Corte                | Rojo (negativa) | `CUT`           |
| `PK`    | Pick                 | Rojo (negativa) | `PICK`          |
| `MF`    | Mal foul             | Rojo (negativa) | `BAD_FOUL`      |

### Catálogo del club

Cada club tiene su propio catálogo de códigos. Mientras nadie lo edite, es el de las tablas anteriores. Se edita en la pantalla [Códigos de la planilla](#códigos-de-la-planilla-chart-codes) (**Planilla** en el menú, `/chart-codes`).

| Acción    | Qué pasa                                                                                                                                                                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renombrar | Cambia el símbolo (1 a 3 caracteres), el nombre (1 a 40 caracteres) o el tono (azul o rojo) de cualquier código, de fábrica o propio. El id no cambia: las entradas ya cargadas se ven con el símbolo, el nombre y el color nuevos, y el resumen por jugador cuenta el tono nuevo. |
| Agregar   | Suma un código propio a una categoría, al final de su lista, marcado **Propio**. Se guarda con un id `CUSTOM_<id>`.                                                                                                                                                               |
| Archivar  | El código deja de aparecer en el panel de carga en vivo y ya no se puede cargar. Las entradas ya cargadas lo siguen mostrando en la grilla. **Restaurar** lo devuelve al panel. Las referencias de la planilla listan solo los códigos activos.                                   |
| Borrar    | No existe. Los códigos nunca se borran, solo se archivan, para que ninguna entrada vieja quede sin su código.                                                                                                                                                                      |

**Quién lo edita.** El administrador y los entrenadores principales (permiso `MANAGE_CHART_CATALOG`). El servidor rechaza los cambios del catálogo que llegan de cualquier otro rol. El asistente planillero ve la lista en modo lectura.

**Sincronización.** Cada código editado o agregado viaja como un registro de tipo `chartCode`, con la misma cola de salida que las divisiones y los jugadores: funciona sin conexión y llega a todas las tablets. Al cargar una entrada en vivo, la consola la valida contra los códigos activos del club.

### Planteles rivales

El club puede cargar el plantel de cada rival, por división, en la pantalla [Rivales](#rivales-rivals) o directamente en el formulario del partido (sección **Plantel rival**, ver [Partidos](#partidos-matches)); los dos lugares editan los mismos planteles. Con ese plantel, una entrada de **Puntos recibidos** puede guardar quién convirtió y una **Acción ofensiva** quién defendió (ver el paso **Rival (opcional)** en [Cargar la planilla durante el partido](#cargar-la-planilla-durante-el-partido)).

**Cómo encuentra la consola el plantel.** El partido no se vincula a mano: la consola usa el rival de la **misma división** del partido cuyo nombre es **igual al nombre del rival del partido**, sin importar mayúsculas, acentos ni espacios al principio o al final. Por ejemplo, el partido de Primera División contra "Obras Sanitarias" usa el rival "obras sanitarias" de Primera División, pero no el de Sub-19 ni uno llamado "Obras". Si el nombre no coincide, la consola no ofrece el paso del rival; para arreglarlo se renombra el rival (o el partido) hasta que coincidan.

**Qué se guarda.** La entrada guarda el id del jugador rival. La planilla y **Últimas entradas** muestran su dorsal y su nombre tomados del plantel actual: si después se corrige el nombre, las entradas se ven con el nombre nuevo; si se quita al jugador o se elimina el rival, las entradas se conservan y muestran `#?` en lugar del jugador rival. La canasta del rival que suma al marcador (ver [Qué no cambia la planilla](#qué-no-cambia-la-planilla)) no queda a nombre de ningún jugador rival.

### Leer la planilla táctica

**Dónde está.** En la página del partido (`/matches/[id]/stats`), sección **Planilla**, la primera debajo del resultado. Desde la consola, el botón **Planilla** de la barra de herramientas abre esa página. Dentro de la consola, la grilla se ve junto al panel de carga (o en la pestaña **Ver planilla** en pantallas angostas), sin el resumen por jugador ni las referencias.

| Parte               | Cómo se lee                                                                                                                                                                                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grilla              | Una fila por categoría y una columna por período: 1C a 4C siempre, más los suplementarios que tengan entradas. Cada entrada aparece como dorsal y símbolo (por ejemplo `#7 P`, o `EQ P` si es del equipo), en azul o rojo según el tono. Al apoyar el puntero sobre una entrada se ven la acción completa, el jugador, el jugador rival si se cargó (por ejemplo "convirtió #7 Lautaro Domínguez") y el reloj. |
| Totales por período | Debajo de las entradas de cada celda: la cantidad de entradas; en **Puntos recibidos**, además, los puntos recibidos (por ejemplo `7 pts`). En **Acciones ofensivas**, los puntos convertidos y el conteo por código, por ejemplo `A=1 F=4`. Una celda sin entradas muestra `-`.                                                                   |
| Mitades y total     | Columnas **1.ª mitad** (1C y 2C), **2.ª mitad** (3C, 4C y suplementarios) y **Total** del partido, con la cantidad de entradas y, en **Puntos recibidos**, los puntos.                                                                                                                                                            |
| Resumen por jugador | Una fila por jugador con entradas y una de **Equipo**: cantidad de **Pérdidas**, **Puntos recibidos** (con los puntos), **Ofensivas**, **Defensivas** y el total de acciones positivas (`+`) y negativas (`−`).                                                                                                                   |
| Referencias         | Los códigos activos del catálogo del club en cada categoría, con su símbolo y su color. Los archivados no figuran, pero sus entradas viejas siguen en la grilla.                                                                                                                                                                  |

Debajo de la planilla, en la misma página, siguen los parciales por período y el box score.

### Qué no cambia la planilla

- **Excepción: los puntos sí van al marcador.** Una entrada de **Puntos recibidos** suma sus puntos al rival y una **Acción ofensiva** que convirtió los suma al equipo propio, del lado que le toca en el tablero (local a la izquierda, visitante a la derecha). Para eso la entrada registra también la jugada de puntos: 1 = tiro libre convertido, 2 = doble convertido, 3 = triple convertido. La del equipo propio queda a nombre del mismo jugador, así los parciales y el box score coinciden con el marcador. En la consola es la única forma de sumar puntos: la barra de herramientas no suma puntos al rival (ver [Faltas del rival](#faltas-del-rival)).
- Fuera de los puntos, las entradas de la planilla no cambian las faltas (de jugador ni de equipo), los tiros fallados ni la analítica de temporada. Anotar **Pase malo** en la planilla no suma una pérdida. La consola no registra rebotes, asistencias, robos, tapas, pérdidas, faltas propias ni tiros fallados: por eso el box score de la página del partido muestra solo los puntos y los tiros libres, dobles y triples convertidos que suman las jugadas de puntos de las entradas.
- El **Deshacer** de la planilla quita la última entrada y, si sumó puntos, también su jugada de puntos. Las demás entradas no se tocan. **Deshacer falta**, en la barra de herramientas, quita solo la última falta del rival y no toca ninguna entrada.
- Las entradas viajan como jugadas de tipo `CHART`: se guardan al instante en la tablet, se envían con la misma cola de salida y solo se agregan; deshacer una entrada la marca como eliminada en todas las tablets (ver [Sincronización](#sincronización)).

### Fuentes

No existe un estándar universal; se basa en la planilla del entrenador, los tipos de pérdida del FIBA Statisticians' Manual 2024 (Anexo B) y las planillas de coaching: turnover chart, defensive breakdown chart, hustle stats.

- Planilla del entrenador: la planilla de papel "Sistemas", con sus cuatro bloques y su leyenda de códigos, es la base del catálogo.
- FIBA Statisticians' Manual 2024, Anexo B: nombres de los tipos de pérdida (pase malo, caminos, doble dribling, manejo de balón, falta ofensiva, violaciones de tiempo, pelota afuera).
- Turnover chart: cada pérdida con su jugador y su tipo.
- Defensive breakdown chart: una entrada por canasta recibida, con la falla que la permitió, el jugador y los puntos.
- Hustle stats (como las de NBA.com): desvíos, tiros contestados, bloqueos de rebote y otras acciones de esfuerzo defensivo.

---

## 3. Inicio rápido

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

| Comando               | Qué hace                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`         | Servidor de desarrollo de Next.js.                                                                                                                          |
| `npm run build`       | Compilación de producción.                                                                                                                                  |
| `npm run start`       | Sirve la compilación de producción (requiere `npm run build` antes).                                                                                        |
| `npm run lint`        | ESLint con la configuración de Next.js (`eslint.config.mjs`).                                                                                               |
| `npm test`            | Pruebas unitarias (runner `node:test` vía `tsx`): todos los `src/**/*.test.ts` salvo los `*.db.test.ts`. No necesitan base de datos.                        |
| `npm run test:db`     | Pruebas de integración contra PostgreSQL (`*.db.test.ts`). Usan una base aparte (ver [Variables de entorno](#variables-de-entorno)).                        |
| `npm run db:up`       | Levanta PostgreSQL 17 en Docker (`docker compose up -d --wait`).                                                                                            |
| `npm run db:down`     | Detiene el contenedor. Los datos quedan en el volumen `hoop-pgdata`.                                                                                        |
| `npm run db:migrate`  | Aplica las migraciones SQL versionadas de `drizzle/`.                                                                                                       |
| `npm run db:generate` | Genera una migración nueva a partir de `src/server/db/schema.ts` (solo al cambiar el esquema).                                                              |
| `npm run db:seed`     | Carga el club de demostración y las cuentas. Solo inserta lo que falta (ver [Datos de demostración en el servidor](#datos-de-demostración-en-el-servidor)). |
| `npm run db:import-actas` | Reemplaza todos los datos del club por los de las actas oficiales (ver [Importar las actas oficiales](#importar-las-actas-oficiales)). Con `--dry-run` solo valida. |

Control de tipos (no tiene script propio): `npx tsc --noEmit`.

---

## 4. Roles y permisos

Hay tres roles. Cada usuario tiene uno, asignado en el servidor por el administrador desde [Usuarios](#usuarios-users). Cada pantalla oculta o deshabilita lo que el rol no puede hacer, usando la matriz de `src/core/domain/rules/permissions.ts` (función `can(role, permission)`). El servidor aplica la misma matriz a cada cambio que recibe, así que un permiso no se puede saltear desde el navegador.

### Matriz de permisos

| Permiso                | Qué habilita                                                                           | Administrador | Entrenador principal | Asistente planillero |
| ---------------------- | -------------------------------------------------------------------------------------- | :-----------: | :------------------: | :------------------: |
| `MANAGE_DIVISIONS`     | Crear, editar y eliminar divisiones y entrenadores; asignar el cuerpo técnico          |      Sí       |          No          |          No          |
| `MANAGE_PLAYERS`       | Crear, editar y eliminar jugadores; convocar juveniles a Primera                       |      Sí       |          Sí          |          No          |
| `MANAGE_MATCHES`       | Crear y editar partidos programados, eliminar partidos programados o finalizados; cargar y editar los planteles rivales   |      Sí       |          Sí          |          No          |
| `MANAGE_LINEUP`        | Armar convocatoria y quinteto; iniciar el partido                                      |      Sí       |          Sí          |          No          |
| `RECORD_LIVE`          | Usar la consola en vivo: reloj, períodos, jugadas, tiempos muertos, finalizar          |      Sí       |          Sí          |          Sí          |
| `MANAGE_CHART_CATALOG` | Editar el catálogo de códigos de la planilla: renombrar, agregar, archivar y restaurar |      Sí       |          Sí          |          No          |
| `MANAGE_USERS`         | Ver todas las cuentas; crearlas, editarlas, desactivarlas, reactivarlas y restablecer su contraseña ([Usuarios](#usuarios-users)) |      Sí       |          No          |          No          |

Lo que cualquier rol puede ver: dashboard, listado de divisiones y su plantel ("Ver plantel"), jugadores, calendario, convocatorias (en modo lectura), planillas estadísticas, los códigos de la planilla, los planteles rivales y los entrenadores (en modo lectura). Sin `RECORD_LIVE` la consola se abre en modo lectura con un aviso.

Cualquier rol puede, además, [cambiar su propia contraseña](#cambiar-contraseña-accountpassword). Nadie puede cambiar su propio nombre, correo ni rol: eso lo hace el administrador.

### Cuentas de demostración

El rol sale de la cuenta con la que se inicia sesión. `npm run db:seed` crea estas cuentas, todas con la contraseña de `SEED_DEMO_PASSWORD` (por defecto `camg1922`):

| Rol                  | Usuario              | Correo                   |
| -------------------- | -------------------- | ------------------------ |
| Administrador        | Alejandro Montecchia | `admin@camg.com.ar`      |
| Entrenador principal | Federico Balbi       | `fbalbi@camg.com.ar`     |
| Entrenador principal | Sergio Hernández     | `shernandez@camg.com.ar` |
| Entrenador principal | Julio Lamas          | `jlamas@camg.com.ar`     |
| Asistente planillero | Mariano Ginóbili     | `mginobili@camg.com.ar`  |

Después de [importar las actas oficiales](#importar-las-actas-oficiales) solo queda la cuenta `admin@camg.com.ar` (con su misma contraseña); las demás cuentas y todas las sesiones se borran.

`db:seed` es para demostración y pruebas. En el uso real, el administrador crea las demás cuentas desde [Usuarios](#usuarios-users), cada una con una contraseña temporal que la persona reemplaza en su primer ingreso (ver [Primer ingreso con una contraseña temporal](#primer-ingreso-con-una-contraseña-temporal)).

Los [entrenadores](#entrenadores-coaches) del club no son cuentas: son fichas sin usuario que no inician sesión. Cargarlos o asignarlos no cambia los usuarios ni sus roles.

Para usar otro rol hay que cerrar sesión y entrar con otra cuenta. Si el rol de una cuenta cambia en el servidor, la aplicación lo toma la próxima vez que confirma la sesión con conexión.

> Fuera de un entorno de prueba, cambiar la contraseña de demostración: cada cuenta lo hace desde **Cambiar contraseña** en su menú de usuario. Volver a correr `npm run db:seed` restablece la contraseña de las cuentas de demostración a la de `SEED_DEMO_PASSWORD`.

---

## 5. Guía por pantalla

### Navegación general

| Elemento                   | Dónde                  | Función                                                                                                                                                                                                                                                                                                                                   |
| -------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Riel lateral (tablet)      | Izquierda              | Escudo y marca (vuelve al inicio), Dashboard, Divisiones, Jugadores, Partidos, Rivales ([planteles rivales](#rivales-rivals), icono `Swords`), Entrenadores ([cuerpo técnico](#entrenadores-coaches), icono `UserCog`), Usuarios ([cuentas](#usuarios-users), icono `UsersRound`, solo para el administrador), Planilla ([códigos de la planilla](#códigos-de-la-planilla-chart-codes)), Ayuda, botón **Partido en vivo** y, al pie, el menú de usuario: nombre, rol, botón de tema claro/oscuro, [estado de sincronización](#estado-de-sincronización), **Ayuda y manual**, **Cambiar contraseña** y **Cerrar sesión**. |
| Barra superior (teléfono)  | Arriba                 | Escudo y marca (vuelve al inicio), el estado de sincronización compacto y los iconos de Planilla (`ClipboardList`, códigos de la planilla) y Ayuda (`LifeBuoy`).                                                                                                                                                                          |
| Barra inferior (teléfono)  | Abajo                  | Inicio, Equipos, botón central de partido en vivo (icono `Radio`), Plantel y Fechas.                                                                                                                                                                                                                                                      |
| Menú de usuario (teléfono) | Cabecera del Dashboard | Nombre, rol, estado de sincronización, **Ayuda y manual**, **Usuarios** (solo el administrador), **Cambiar contraseña** y **Cerrar sesión**.                                                                                                                                                                                          |
| Diálogos                   | Sobre la pantalla      | Modales propios: avisos (`notify`, botón "Entendido") y confirmaciones (`confirm`, botones "Cancelar" y la acción). Se muestran de a uno, en cola.                                                                                                                                                                                        |

### Inicio de sesión (`/login`)

Pantalla con el escudo del club, campos **Email** y **Contraseña** y el botón **Ingresar**.

| Situación                               | Qué pasa                                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Datos correctos                         | Entra y vuelve a la pantalla que se había pedido (o al Dashboard).                                                          |
| Correo o contraseña incorrectos         | Modal "No pudimos iniciar sesión" con el mensaje genérico "Email o contraseña incorrectos" (no revela si el correo existe). |
| Sin conexión                            | Modal "Sin conexión": el primer ingreso en una tablet necesita llegar al servidor.                                          |
| Campos vacíos o correo mal escrito      | El error aparece debajo del campo.                                                                                          |
| Ya hay una sesión guardada en la tablet | Botón **Continuar como \<nombre\>** para volver sin escribir la contraseña.                                                 |
| Cuenta con contraseña temporal          | Entra y pasa directo a [Cambiar contraseña](#cambiar-contraseña-accountpassword): hasta elegir una contraseña propia no se puede usar ninguna otra pantalla. |
| Cuenta desactivada                      | El mismo mensaje genérico "Email o contraseña incorrectos": una cuenta desactivada no puede iniciar sesión.                 |

Cualquier otra pantalla, sin una sesión guardada, redirige a `/login` y después vuelve a la pantalla pedida.

### Estado de sincronización

Botón visible en el riel lateral (tablet), en la barra superior (teléfono), en el menú de usuario del Dashboard y en la barra de herramientas de la consola en vivo, junto a **Partidos** (la consola ocupa toda la pantalla sin el menú lateral, así que ese es su único indicador y queda a la vista también en el teléfono). Tocarlo sincroniza en ese momento; en una pestaña secundaria le pide a la pestaña principal que sincronice.

| Estado        | Icono              | Significado                                                                                                                               |
| ------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Sincronizado  | `Cloud`            | Todo está en el servidor. Muestra hace cuánto fue la última sincronización.                                                               |
| Sincronizando | `RefreshCw` (gira) | Enviando o recibiendo cambios, o hay cambios pendientes por salir en instantes.                                                           |
| Sin conexión  | `CloudOff`         | No hay red o el servidor no responde. Muestra cuántos cambios esperan en la cola ("3 pendientes"). La aplicación sigue funcionando igual. |
| Error         | `AlertTriangle`    | El servidor rechazó cambios o respondió con un error. Muestra el motivo y "Toca para reintentar".                                         |

### Ayuda (`/help`)

Este manual, dentro de la aplicación. Se abre desde **Ayuda** en el menú lateral, desde el icono de ayuda de la barra superior en el teléfono y desde **Ayuda y manual** en el menú de usuario. El índice de la izquierda resalta la sección que se está leyendo (en pantallas angostas se pliega arriba). La página queda disponible sin conexión una vez cargada. El botón **Ver tutorial** abre la lista de recorridos guiados.

### Tutorial guiado

La primera vez que inicias sesión, Hoop muestra un recorrido de bienvenida: la pantalla se oscurece, se resalta un elemento por vez y una tarjeta con una flecha explica para qué sirve, muchas veces con un ejemplo concreto (por ejemplo, "toca #7 Campagna y después +2").

- **Bienvenida**: presenta el menú (Dashboard, Divisiones, Jugadores, Partidos, Modo partido en vivo, Códigos de la planilla), el estado de sincronización, tu menú de usuario y la Ayuda. Cuando la terminas o la saltas, el recorrido de la pantalla en la que estás no empieza enseguida: aparece la próxima vez que abras esa pantalla.
- **Recorridos por pantalla**: la primera vez que abres Dashboard, Divisiones, Jugadores, Partidos, Quinteto y convocatoria, Consola en vivo, Planilla, Códigos de la planilla, Rivales, Entrenadores o Ayuda, se muestra un recorrido corto de esa pantalla.
- **Según tu rol**: los pasos de acciones que tu rol no puede realizar (por ejemplo, crear divisiones) no se muestran.
- **Controles**: Siguiente, Atrás y Saltar tutorial (Finalizar en el último paso). Con teclado: Enter o flecha derecha avanza, flecha izquierda retrocede y Escape salta el tutorial. Tocar la zona oscura no cierra el recorrido y el elemento resaltado no se puede tocar mientras dura.
- **Consola en vivo**: el recorrido nunca empieza solo con el reloj de juego en marcha; espera a que lo pauses.
- **Volver a verlo**: en Ayuda, el botón **Ver tutorial** lista todos los recorridos con su estado (Visto, Saltado, Pendiente). Puedes abrir cualquiera o usar **Reiniciar todos** para que vuelvan a mostrarse automáticamente. En tu menú de usuario, **Ver tutorial de esta pantalla** repite el de la pantalla abierta.
- Lo que ya viste se guarda en el dispositivo para cada usuario: otra persona que inicie sesión en la misma tablet verá sus propios tutoriales.

### Dashboard (`/`)

Resumen de la temporada de la división elegida.

| Control o bloque               | Qué hace                                                                                                                                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chips **División del tablero** | Cambian la división que alimentan los indicadores. Solo aparecen si hay más de una división.                                                                                                                                                                                                            |
| Tarjeta principal              | Si hay un partido en juego: marcador, período y reloj, con botones **Convocatoria** y **Abrir consola en vivo**. Si no, el próximo partido programado con **Ver calendario** y **Armar quinteto** (o **Ver convocatoria** sin permiso de convocatoria). Considera los partidos de todas las divisiones. |
| Indicadores                    | Récord (ganados-perdidos y % de victorias), puntos a favor (con diferencial) y puntos en contra. Se calculan con los partidos finalizados del equipo. Los partidos con resultado del acta oficial cuentan para el récord y los puntos. Los porcentajes de tiro no se muestran: los tiros fallados no se registran.                                                                                                       |
| Máximo anotador                | Promedio de puntos por partido (PPG) del jugador que más anota, con los puntos que suma la planilla (no se registran rebotes, asistencias ni tiros fallados). Un jugador suma un partido cuando figura en la convocatoria. Si ningún partido tiene jugadas cargadas (solo resultados del acta), muestra "Sin datos".                                                                                                                                                 |
| Últimos resultados             | Hasta 5 partidos finalizados (G, P o E) con enlace a su planilla.                                                                                                                                                                                                                                       |
| Alertas médicas                | Jugadores lesionados o suspendidos de todo el club, con su parte médico.                                                                                                                                                                                                                                |

### Divisiones (`/divisions`)

Cada tarjeta muestra nombre, categoría, descripción, cantidad de jugadores, temporada, entrenador principal y ayudantes. El botón **Entrenadores** de la cabecera abre las [fichas del cuerpo técnico](#entrenadores-coaches); en el teléfono es el acceso a esa pantalla.

| Control             | Qué hace                                                                                                                      | Permiso            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| **Nueva división**  | Abre el formulario de alta.                                                                                                   | `MANAGE_DIVISIONS` |
| **Ver plantel**     | Modal de solo lectura con los jugadores del equipo (incluye juveniles convocados, marcados "Convocado") y sus partes médicos. | Todos              |
| Lápiz (`Pencil`)    | Editar la división, su entrenador principal y sus ayudantes.                                                                  | `MANAGE_DIVISIONS` |
| Papelera (`Trash2`) | Eliminar la división, con confirmación.                                                                                       | `MANAGE_DIVISIONS` |

Campos del formulario: **Nombre** (mínimo 2 caracteres), **Categoría** (Primera, Sub-21, Sub-19, Sub-17, Sub-15, Sub-13, Mini básquet, Femenino, Otra categoría), **Entrenador principal** (cualquier [entrenador](#entrenadores-coaches) cargado, con su rol al lado, u opción "Sin entrenador asignado"), **Ayudantes** (un chip por entrenador, salvo el elegido como principal; aparece cuando hay entrenadores) y **Descripción o torneo** (máximo 120 caracteres). Sin entrenadores cargados, el campo lo avisa: "Todavía no hay entrenadores: cárgalos desde Entrenadores."

### Jugadores (`/players`)

| Control                                      | Qué hace                                                                                                                | Permiso          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Buscar jugador**                           | Filtra por apellido, nombre o dorsal exacto.                                                                            | Todos            |
| Chips **División**, **Posición**, **Estado** | Filtros combinables; cada chip muestra cuántos jugadores quedarían. Aparece "Sin equipo" si hay jugadores sin división. | Todos            |
| **Nuevo jugador**                            | Abre el formulario de alta.                                                                                             | `MANAGE_PLAYERS` |
| Tocar la tarjeta                             | Abre el jugador para editarlo o eliminarlo.                                                                             | `MANAGE_PLAYERS` |
| **Convocar a Primera**                       | Suma un juvenil al plantel de Primera (ver [flujo](#convocar-un-juvenil-a-primera)).                                    | `MANAGE_PLAYERS` |

Cada tarjeta muestra dorsal, posición, estado, puntos de la temporada (partidos finalizados), altura, mano hábil, licencia, división y parte médico. La posición, la altura y la licencia son opcionales: si faltan se ve "—". Un jugador sin posición solo aparece con el chip **Posición** en "Todas".

Campos del formulario: Nombre, Apellido, Dorsal (0 a 99), Posición (opcional: Base, Escolta, Alero, Ala-Pívot, Pívot), Altura en cm (opcional, 120 a 240), Peso en kg (opcional), Licencia (opcional, número de licencia de la federación, hasta 20 caracteres), Mano hábil, Estado físico (Disponible, Lesionado, Suspendido), División y Parte médico (máximo 240 caracteres). En modo edición aparece el botón **Eliminar**, con confirmación.

### Partidos (`/matches`)

Orden fijo: primero los partidos en juego, después los programados (el más próximo primero) y al final los finalizados (el más reciente primero).

| Control            | Qué hace                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| Chips **Estado**   | Todos, En vivo, Programados, Finalizados.                                                       |
| Chips **División** | Filtra por división. Los partidos de una división eliminada aparecen como "División eliminada". |
| **Nuevo partido**  | Abre el formulario (requiere `MANAGE_MATCHES`).                                                 |
| **Rivales**        | Abre los [planteles rivales](#rivales-rivals). En el teléfono es el acceso a esa pantalla.     |

Acciones de cada tarjeta según su estado:

| Estado     | Acciones                                                                             |
| ---------- | ------------------------------------------------------------------------------------ |
| En vivo    | **Convocatoria** y **Consola en vivo**.                                              |
| Programado | Editar y eliminar (con `MANAGE_MATCHES`); **Armar quinteto** o **Ver convocatoria**. |
| Finalizado | Eliminar (con `MANAGE_MATCHES`; borra también su planilla, sus jugadas y su resultado); **Planilla box score**. |

Un partido finalizado que solo tiene el resultado del acta oficial (sin jugadas de puntos, por ejemplo los [importados](#importar-las-actas-oficiales)) muestra debajo del marcador la marca **Resultado oficial (acta)**.

Campos del formulario: **División** (el equipo propio se deduce de ella), **Equipo rival**, **Fecha y hora**, **Condición** (Local o Visitante), **Torneo o competencia** y **Estadio o cancha** (opcional). Si al editar se cambia la división, se vacían la convocatoria y el quinteto del partido.

**Rivales de esta división.** Debajo de **Equipo rival** aparece un chip por cada rival cargado en la división elegida, ordenados por nombre. Tocar un chip escribe ese nombre en el campo; también se puede escribir cualquier otro nombre. Si la división no tiene rivales cargados, la fila no aparece.

**Plantel rival.** Al final del formulario, en crear y en editar, una sección muestra el plantel del rival escrito, buscado igual que en la consola: el rival de la **misma división** con el mismo nombre, sin importar mayúsculas, acentos ni espacios (ver [Planteles rivales](#planteles-rivales)). Son los mismos planteles de la pantalla [Rivales](#rivales-rivals): lo que se cambia acá se ve allá y al revés.

| Situación                                  | Qué muestra la sección                                                                                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Equipo rival vacío                         | Nada.                                                                                                                                                           |
| El rival tiene plantel en la división      | Sus jugadores ordenados por dorsal (dorsal, nombre y apellido), con lápiz y papelera por jugador y el botón **Agregar jugador**.                                |
| El rival no tiene plantel en la división   | El texto "Boca Juniors no tiene plantel en Primera División." (con el nombre y la división elegidos) y el botón **Agregar jugador**.                            |

**Agregar jugador** y el lápiz abren el mismo formulario del jugador de [Rivales](#rivales-rivals) (**Dorsal**, **Nombre** y **Apellido**, con los mismos mensajes, incluido "Ya hay un jugador con ese dorsal en este equipo."). La papelera quita al jugador sin confirmación, porque nada se guarda todavía.

**Cuándo se guarda.** Los cambios del plantel quedan en el formulario (un aviso en amarillo lo recuerda) y se guardan recién al pulsar **Crear partido** o **Guardar cambios**, después de guardar el partido. Si el rival no tenía plantel, se crea con el nombre escrito y la división elegida y se le agregan los jugadores. **Cancelar**, la cruz, Escape o tocar fuera del formulario descartan los cambios del plantel. Sin cambios en el plantel, el formulario no toca los rivales. Si algún cambio del plantel es rechazado (por ejemplo, otra tablet ya usó ese dorsal), el partido queda guardado igual y un aviso "El partido se guardó, pero no todo el plantel rival" lista cada jugador rechazado con su motivo.

Solo quien tiene `MANAGE_MATCHES` abre este formulario, así que solo el administrador y los entrenadores principales editan el plantel desde acá.

### Quinteto y convocatoria (`/matches/[id]/lineup`)

La pantalla tiene tres modos según el estado del partido:

| Modo        | Estado del partido | Qué se puede hacer                                                                                                                       |
| ----------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Preparación | Programado         | Elegir convocados (máximo 12) y exactamente 5 titulares; **Iniciar partido**.                                                            |
| En juego    | En vivo            | El quinteto inicial queda bloqueado. Solo se pueden sumar convocados y guardarlos con **Guardar convocatoria**; **Volver a la consola**. |
| Finalizado  | Finalizado         | Solo lectura; **Ver box score**.                                                                                                         |

- Candidatos: los jugadores del equipo del partido más los juveniles convocados a ese equipo. Los suspendidos no se pueden convocar.
- Contadores: `convocados/12` y `titulares/5`, en verde cuando son válidos.
- Mensajes: lista de lo que falta para iniciar, advertencia si hay lesionados convocados y aviso si el rol no puede editar.
- En preparación, la selección es un borrador: se guarda en el partido recién al pulsar **Iniciar partido**.

### Consola en vivo (`/matches/[id]/live`)

Pantalla de registro del partido en cancha, a altura completa y sin desplazamiento general.

**Planilla.** La consola es la planilla táctica (ver [Cargar la planilla durante el partido](#cargar-la-planilla-durante-el-partido)). Desde 900 px de ancho, el panel de carga a la izquierda y la grilla de la planilla a la derecha. En pantallas más angostas, dos pestañas: **Cargar** y **Ver planilla**.

**Accesos.** Si el partido está programado, la consola muestra un aviso con el botón para armar el quinteto. Si está finalizado, muestra el resultado y un enlace a la planilla.

| Zona                  | Controles                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tablero (arriba)      | Por equipo (local a la izquierda, visitante a la derecha): nombre, marcador, cuatro luces de faltas de equipo con el contador `N F`, indicador **Bonus** y botón **TM** con los tiempos muertos que quedan. Al centro: selector de período (`1C` a `4C`, y `S1` a `S4` para suplementarios), reloj con **-10s**, **+10s** y **Iniciar/Pausar**. |
| Barra de herramientas | **Partidos** (volver), estado de sincronización (compacto), faltas del rival (**Falta** y **Deshacer falta**, ver [Faltas del rival](#faltas-del-rival)), **Planilla** y **Finalizar**.                                                                                                                                                                                               |
| Panel de carga        | Pestañas de categoría, paso 1 con toda la convocatoria y **Equipo**, **2. Acción**, **3. Resultado** (solo Acciones ofensivas), el paso **Rival (opcional)** cuando el rival tiene plantel, y **Últimas entradas** con **Deshacer**. |
| Planilla              | Grilla compacta por categoría y período, con los totales por período, por mitad y del partido (ver [Leer la planilla táctica](#leer-la-planilla-táctica)). |

**Entretiempo.** Al terminar el 2.º cuarto el partido pasa a **Entretiempo**: el tablero muestra "Entretiempo" en lugar del reloj, un aviso indica que no se registran jugadas ni tiempos muertos y el botón **Comenzar 3.er cuarto** reanuda el partido (3.er cuarto, reloj en 10:00, En vivo). Cualquier salto desde el 1.º o el 2.º cuarto a la segunda mitad o a un suplementario pasa primero por el entretiempo. Desde el entretiempo también se puede finalizar el partido; el reloj queda guardado en 00:00.

Sin el permiso `RECORD_LIVE` se muestra el banner "Modo lectura" y se ocultan o deshabilitan todos los controles.

### Partido en vivo (`/matches/live`)

Atajo del botón **Partido en vivo**. Si hay un partido en juego, redirige a su consola; si no, muestra "No hay partidos en juego" con un enlace a Partidos.

### Planilla estadística (`/matches/[id]/stats`)

| Bloque                | Contenido                                                                                                                                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resultado             | Marcador propio y rival. Si terminó: Victoria, Derrota o Empate. Si está en juego: estado y período, con acceso a la **Consola en vivo**.                                                                                                                                                    |
| Planilla              | Planilla táctica cargada en vivo: grilla por categoría y período con totales por mitad y del partido, resumen por jugador y referencias de los códigos (ver [Leer la planilla táctica](#leer-la-planilla-táctica)).                                                                          |
| Parciales por período | Puntos por cuarto (1C a 4C) más los suplementarios que tuvieron jugadas. En un partido con resultado del acta y sin jugadas de puntos, los cuartos del acta.                                                                                                                               |
| Box score             | Una fila por convocado (dorsal y jugador) y una de **Totales equipo**: PTS (puntos), TL (tiros libres convertidos), 2P (dobles convertidos) y 3P (triples convertidos). Salen de las jugadas de puntos de la planilla.                                                                       |

Un partido programado muestra "El partido todavía no comenzó".

**Resultado oficial (acta).** Un partido que tiene el resultado del acta oficial y ninguna jugada de puntos (los [importados](#importar-las-actas-oficiales)) muestra el tanteo final y los parciales del acta. Debajo del resultado aparece la marca **Resultado oficial (acta)** con el aviso "El resultado y los parciales vienen del acta oficial. El partido no tiene jugadas cargadas, por eso la planilla y el box score quedan vacíos." No se inventan jugadas. Si después se cargan jugadas de puntos, el marcador vuelve a salir de ellas.

### Códigos de la planilla (`/chart-codes`)

El catálogo de códigos de la planilla táctica del club (ver [Catálogo del club](#catálogo-del-club)). Se abre desde **Planilla** en el riel lateral o desde el icono `ClipboardList` de la barra superior en el teléfono.

Hay una sección por categoría (**Pérdidas**, **Puntos recibidos**, **Acciones ofensivas** y **Acciones defensivas**) con la cantidad de códigos activos y archivados. Cada código se lista en el orden del panel de carga en vivo, con su símbolo en su color (azul positiva, rojo negativa), su nombre y su tono. **Propio** marca los códigos que agregó el club y **Archivado** los que ya no se cargan.

| Control                      | Qué hace                                                                                                               | Permiso                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **Nuevo código**             | Abre el formulario para agregar un código propio a la categoría.                                                       | `MANAGE_CHART_CATALOG` |
| Lápiz (`Pencil`)             | Edita el símbolo, el nombre o el tono del código. Las entradas ya cargadas se ven con el cambio.                        | `MANAGE_CHART_CATALOG` |
| Archivar (`Archive`)         | Pide confirmación y archiva el código: sale del panel de carga en vivo y las entradas ya cargadas lo siguen mostrando. | `MANAGE_CHART_CATALOG` |
| Restaurar (`ArchiveRestore`) | Devuelve un código archivado al panel de carga en vivo.                                                                | `MANAGE_CHART_CATALOG` |

Campos del formulario: **Símbolo** (1 a 3 caracteres), **Tono** (Azul (positiva) o Rojo (negativa)) y **Nombre** (1 a 40 caracteres). Un código nuevo empieza en rojo en **Pérdidas** y **Puntos recibidos** y en azul en las otras dos categorías. Sin el permiso `MANAGE_CHART_CATALOG` la pantalla muestra la lista en modo lectura con el aviso "Solo el administrador y los entrenadores principales pueden editar los códigos."

### Rivales (`/rivals`)

Los planteles de los equipos rivales, por división (ver [Planteles rivales](#planteles-rivales)). Se abre desde **Rivales** en el riel lateral o, en el teléfono, desde el botón **Rivales** de la cabecera de [Partidos](#partidos-matches); la barra superior del teléfono no cambia.

Los chips **División** filtran los rivales (Todas o una división; los de una división eliminada aparecen como "División eliminada"). Cada rival es una tarjeta con su nombre, su división, la cantidad de jugadores, la cantidad de partidos de la división con ese mismo nombre de rival (icono `Link2`; "Ningún partido con este nombre" en amarillo si no coincide ninguno) y el plantel ordenado por dorsal, con nombre y apellido.

| Control                         | Qué hace                                                                                                         | Permiso          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Nuevo rival**                 | Abre el formulario: **División** y **Nombre del equipo** (1 a 60 caracteres). El rival empieza sin jugadores.   | `MANAGE_MATCHES` |
| Lápiz (`Pencil`) de la tarjeta | Renombra el rival. La división no se cambia.                                                                     | `MANAGE_MATCHES` |
| Papelera (`Trash2`) de la tarjeta | Elimina el rival con su plantel, con confirmación. Las entradas ya cargadas se conservan.                      | `MANAGE_MATCHES` |
| **Agregar jugador**             | Abre el formulario del jugador: **Dorsal**, **Nombre** y **Apellido**.                                           | `MANAGE_MATCHES` |
| Lápiz y papelera del jugador    | Editan o quitan al jugador (quitar pide confirmación).                                                           | `MANAGE_MATCHES` |

Validaciones del formulario del jugador, con su mensaje:

| Caso                                  | Mensaje                                              |
| ------------------------------------- | ---------------------------------------------------- |
| Dorsal vacío, con decimales o fuera de 0 a 99 | "El dorsal debe ser un número entero de 0 a 99." |
| Dorsal que ya usa otro jugador del rival | "Ya hay un jugador con ese dorsal en este equipo." |
| Nombre vacío o de más de 40 caracteres | "El nombre debe tener de 1 a 40 caracteres."        |
| Apellido vacío o de más de 40 caracteres | "El apellido debe tener de 1 a 40 caracteres."    |

**Quién edita.** El administrador y los entrenadores principales (permiso `MANAGE_MATCHES`). El servidor rechaza los cambios de planteles rivales que llegan de cualquier otro rol. Sin ese permiso la pantalla se ve en modo lectura con el aviso "Solo el administrador y los entrenadores principales pueden editar los planteles rivales."

**Sincronización.** Cada rival viaja con todo su plantel como un registro de tipo `rivalTeam`, con la misma cola de salida que las divisiones y los jugadores: funciona sin conexión y llega a todas las tablets. Si dos tablets cambian el mismo rival, queda el último cambio que llega al servidor.

### Entrenadores (`/coaches`)

El cuerpo técnico del club. Cada entrenador es una ficha sin usuario: no inicia sesión ni tiene rol de acceso; los usuarios y sus roles siguen siendo los de [Roles y permisos](#4-roles-y-permisos). Las divisiones asignan un entrenador principal y ayudantes elegidos entre estas fichas (ver [Asignar el cuerpo técnico de una división](#asignar-el-cuerpo-técnico-de-una-división)). Se abre desde **Entrenadores** en el riel lateral o, en el teléfono, desde el botón **Entrenadores** de la cabecera de [Divisiones](#divisiones-divisions).

Cada tarjeta muestra el nombre, el rol (**Entrenador principal** o **Ayudante**), la licencia ("—" si no tiene) y las divisiones donde está asignado, con su función en cada una (por ejemplo "Primera (principal)"), o "Sin divisiones asignadas". Primero los entrenadores principales y después los ayudantes, por nombre. Sin entrenadores, la pantalla muestra "Todavía no hay entrenadores".

| Control              | Qué hace                                                                                                                                                                                  | Permiso            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| **Nuevo entrenador** | Abre el formulario de alta.                                                                                                                                                               | `MANAGE_DIVISIONS` |
| **Editar**           | Abre la ficha para corregir nombre, licencia o rol.                                                                                                                                       | `MANAGE_DIVISIONS` |
| Papelera (`Trash2`)  | Elimina la ficha, con confirmación. El aviso nombra las divisiones de las que se quita (por ejemplo "Se quitará del cuerpo técnico de Primera."): quedan sin ese entrenador principal o ayudante. | `MANAGE_DIVISIONS` |

Campos del formulario, con su mensaje:

| Campo        | Regla                                                                                                                        | Mensaje                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Nombre**   | De 2 a 60 caracteres, como figura en el acta.                                                                                | "El nombre debe tener de 2 a 60 caracteres."   |
| **Licencia** | Opcional, hasta 20 caracteres. Vacía, la ficha queda sin licencia.                                                           | "La licencia puede tener hasta 20 caracteres." |
| **Rol**      | **Entrenador principal** o **Ayudante**. Es informativo: cualquier entrenador puede ser principal o ayudante de una división. | "Elige el rol del entrenador."                 |

**Quién edita.** Solo el administrador (permiso `MANAGE_DIVISIONS`); el servidor rechaza los cambios de entrenadores de cualquier otro rol. Los demás ven la pantalla en modo lectura con el aviso "Solo el administrador puede cargar y editar entrenadores."

**Sincronización.** Cada entrenador viaja como un registro de tipo `coach`, con la misma cola de salida que las divisiones y los jugadores. Si dos tablets cambian la misma ficha, queda el último cambio.

### Usuarios (`/users`)

Las cuentas que inician sesión en Hoop. Solo el administrador (permiso `MANAGE_USERS`) las ve y las cambia; se abre desde **Usuarios** en el riel lateral o, en el teléfono, desde **Usuarios** en el menú de usuario del Dashboard. Los demás roles no ven ese acceso y, si abren la dirección, la pantalla solo dice "Solo el administrador gestiona los usuarios." El servidor aplica la misma regla a cada pedido: sin sesión responde 401 y sin `MANAGE_USERS`, 403. Un administrador con una contraseña temporal tampoco puede gestionar usuarios hasta cambiarla: el servidor también responde 403.

Cada tarjeta muestra el nombre, el correo y el rol (**Administrador**, **Entrenador principal** o **Asistente planillero**), ordenadas por nombre. Etiquetas:

| Etiqueta                       | Significado                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| **Tu cuenta**                  | La cuenta con la que estás conectado.                                                           |
| **Inactiva**                   | La cuenta está desactivada: sigue en la lista pero no puede iniciar sesión.                     |
| **Debe cambiar la contraseña** | Tiene una contraseña temporal: al ingresar tendrá que reemplazarla antes de usar la aplicación. |

| Control                    | Qué hace                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Nuevo usuario**          | Abre el alta: nombre, correo, rol y contraseña temporal. La cuenta queda activa y con la etiqueta **Debe cambiar la contraseña**. Un aviso repite el correo y la contraseña temporal para entregárselos a la persona.               |
| **Editar**                 | Corrige nombre, correo y rol. En tu propia cuenta el rol aparece deshabilitado.                                                                                                                                                     |
| **Restablecer contraseña** | Pide una contraseña temporal nueva y confirma antes de guardarla: se cierran todas las sesiones de esa cuenta y deberá cambiar la contraseña al volver a ingresar. Si restableces tu propia cuenta, tu sesión también se cierra y vuelves a la pantalla de inicio de sesión. |
| **Desactivar**             | Con confirmación. La cuenta no se borra: queda en la lista como **Inactiva**, no puede iniciar sesión (recibe el mismo mensaje genérico de credenciales incorrectas) y sus sesiones abiertas se cierran al instante. No aparece en tu propia cuenta. |
| **Reactivar**              | Con confirmación. La cuenta vuelve a poder iniciar sesión con su contraseña de siempre.                                                                                                                                             |

Campos de los formularios, con su mensaje:

| Campo                   | Regla                                                                                                                                                                                                                      | Mensaje                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Nombre**              | De 2 a 60 caracteres.                                                                                                                                                                                                      | "El nombre debe tener de 2 a 60 caracteres."          |
| **Email**               | Un correo válido. No puede repetirse (sin distinguir mayúsculas): si ya existe, el campo lo marca con "Ya existe un usuario con ese email."                                                                              | "El email no tiene un formato válido."                |
| **Rol**                 | Administrador, Entrenador principal o Asistente planillero. Una cuenta nueva empieza como Asistente planillero.                                                                                                           | "Elige el rol del usuario."                           |
| **Contraseña temporal** | De 8 a 256 caracteres, tal como se escribe. Queda a la vista para poder copiarla. **Generar** completa una al azar de 12 letras y números, sin caracteres que se confunden (0 y O, 1, l e I). | "La contraseña debe tener entre 8 y 256 caracteres." |

Reglas de seguridad que aplica el servidor, con su aviso:

| Regla                                                       | Aviso                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| No puedes desactivar tu propia cuenta.                      | "No puedes desactivar tu propia cuenta."                                                               |
| No puedes cambiar el rol de tu propia cuenta.               | "No puedes cambiar el rol de tu propia cuenta."                                                        |
| Siempre queda al menos un administrador activo: el último no se puede desactivar ni pasar a otro rol. | "Debe quedar al menos un administrador activo: no puedes desactivar ni cambiar el rol del último." |
| El correo es único.                                         | "Ya existe un usuario con ese email."                                                                  |

**Sin conexión.** Las cuentas no son datos del club: no se guardan en la tablet ni pasan por la cola de sincronización. La lista se pide al servidor cada vez que se abre la pantalla y después de cada cambio. Sin conexión la pantalla muestra "Sin conexión" con el botón **Reintentar**, y los cambios no se pueden hacer hasta que vuelva.

### Cambiar contraseña (`/account/password`)

Cualquier usuario cambia su propia contraseña desde **Cambiar contraseña** en el menú de usuario. Campos: **Contraseña actual**, **Nueva contraseña** y **Repetir nueva contraseña**.

| Situación                                        | Qué pasa                                                                                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Datos correctos                                  | Aviso "Contraseña actualizada". Se cierran tus sesiones en otros dispositivos; la de este sigue abierta.                                       |
| Contraseña actual incorrecta                     | El campo lo marca con "La contraseña actual no es correcta." y no cambia nada.                                                                |
| Nueva contraseña de menos de 8 o más de 256 caracteres | "La contraseña debe tener entre 8 y 256 caracteres."                                                                                         |
| Nueva contraseña igual a la actual               | "La nueva contraseña debe ser distinta de la actual."                                                                                         |
| Las dos nuevas no coinciden                      | "Las contraseñas no coinciden."                                                                                                               |
| Sin conexión                                     | Aviso "Sin conexión": la contraseña solo se cambia con conexión.                                                                              |

**Cambio obligatorio.** Una cuenta nueva o con la contraseña restablecida entra con una contraseña temporal y la aplicación la lleva a esta pantalla, sin menú: el primer campo se llama **Contraseña temporal**, un texto explica que hay que reemplazarla y la única otra opción es **Cerrar sesión**. Hasta cambiarla, cualquier otra pantalla vuelve aquí y la sincronización no arranca (el servidor la rechaza con 403, igual que la gestión de usuarios si la cuenta es de un administrador). Después del cambio la etiqueta **Debe cambiar la contraseña** desaparece, la sincronización arranca y la aplicación sigue a la pantalla que se había pedido (o al Dashboard).

---

## 6. Flujos paso a paso

### Iniciar sesión

1. Abrir Hoop. Sin una sesión guardada aparece la pantalla de inicio de sesión.
2. Escribir el correo y la contraseña de la cuenta y pulsar **Ingresar**.
3. La primera vez en una tablet, la aplicación descarga todos los datos del servidor. El navegador no trae datos propios: hasta que llega esa primera copia, las pantallas se ven vacías (por ejemplo, "Todavía no hay divisiones").

Después del primer ingreso, la tablet abre aunque no haya conexión: guarda el perfil del último usuario (nunca la contraseña ni la sesión).

### Cerrar sesión

1. Pulsar **Cerrar sesión** en el menú de usuario.
2. Si hay cambios pendientes, la aplicación intenta enviarlos primero.
3. Si no puede (por ejemplo, sin conexión), un modal avisa "Hay N cambios sin sincronizar. Si cierras sesión ahora, se perderán en este dispositivo." con las opciones **Seguir conectado** y **Cerrar sesión igual**.
4. Al cerrar sesión se borran de la tablet la sesión, el perfil guardado y la cola de cambios. El próximo ingreso vuelve a descargar todo del servidor.
5. Sin conexión la sesión se cierra igual en la tablet, pero el servidor no se entera: un aviso explica que la sesión del servidor sigue activa hasta que venza (30 días) o hasta el próximo inicio de sesión en esa tablet, que la revoca. La cookie queda en el navegador hasta entonces, así que en una tablet compartida conviene cerrar sesión con conexión.

### Crear un usuario

1. Rol Administrador, con conexión. Ir a **Usuarios** y pulsar **Nuevo usuario**.
2. Completar nombre, correo y rol. En **Contraseña temporal**, escribir una o pulsar **Generar**.
3. Pulsar **Crear usuario**. El aviso "Usuario creado" repite el correo y la contraseña temporal: entregárselos a la persona por un medio privado.
4. La tarjeta nueva aparece con la etiqueta **Debe cambiar la contraseña** hasta que la persona ingrese y la cambie.

### Primer ingreso con una contraseña temporal

1. Iniciar sesión con el correo y la contraseña temporal que dio el administrador.
2. La aplicación abre **Elige tu contraseña**. Escribir la contraseña temporal y dos veces la nueva (de 8 a 256 caracteres, distinta de la temporal).
3. Pulsar **Cambiar contraseña**. La aplicación sigue a la pantalla pedida y empieza a sincronizar.

Mientras no se cambia, no se puede usar ninguna otra pantalla; **Cerrar sesión** deja la tablet lista para otra cuenta.

### Cambiar la propia contraseña

1. Con conexión, abrir **Cambiar contraseña** en el menú de usuario.
2. Escribir la contraseña actual y dos veces la nueva, y pulsar **Cambiar contraseña**.
3. Las sesiones de esa cuenta en otros dispositivos se cierran: allí hay que ingresar con la contraseña nueva.

### Restablecer la contraseña de un usuario

Para alguien que olvidó su contraseña (no hay recuperación por correo):

1. Rol Administrador. En **Usuarios**, pulsar **Restablecer contraseña** en su tarjeta.
2. Escribir o generar una contraseña temporal y pulsar **Restablecer**.
3. Confirmar. Se cierran todas las sesiones de esa cuenta y el aviso repite la contraseña temporal para entregársela. En su próximo ingreso deberá cambiarla.

Si restableces tu propia cuenta, la aplicación cierra tu sesión y vuelve a la pantalla de inicio de sesión: ingresa con la contraseña temporal y elige una nueva.

### Desactivar o reactivar un usuario

1. Rol Administrador. En **Usuarios**, pulsar **Desactivar** en la tarjeta de la cuenta y confirmar.
2. La cuenta queda como **Inactiva**, sus sesiones se cierran al instante y no puede volver a iniciar sesión. Sus datos y lo que cargó en el sistema no cambian.
3. Para devolverle el acceso, pulsar **Reactivar** y confirmar: vuelve a entrar con su contraseña de siempre.

No se puede desactivar la propia cuenta ni la del último administrador activo.

### Crear una división

1. Rol Administrador. Ir a **Divisiones** y pulsar **Nueva división**.
2. Completar nombre, categoría, entrenador (opcional) y descripción.
3. Pulsar **Crear división**. Se crea también su equipo para la temporada 2025/2026, con el nombre `Club Atlético Monte Grande - <nombre de la división>`.

Eliminar una división (papelera, con confirmación) borra su equipo y deja a sus jugadores sin equipo. Sus partidos se conservan en el calendario como "División eliminada".

### Cargar un entrenador

1. Rol Administrador. Ir a **Entrenadores** (en el teléfono, botón **Entrenadores** de Divisiones) y pulsar **Nuevo entrenador**.
2. Completar **Nombre**, **Licencia** (opcional) y **Rol**.
3. Pulsar **Crear entrenador**. La ficha queda lista para asignarla a una división; el entrenador no recibe usuario ni contraseña.

### Asignar el cuerpo técnico de una división

1. Rol Administrador. Cargar antes los entrenadores (ver [Cargar un entrenador](#cargar-un-entrenador)).
2. En la tarjeta de la división, pulsar el lápiz.
3. En **Entrenador principal**, elegir un entrenador o "Sin entrenador asignado". En **Ayudantes**, tocar los chips de los entrenadores que acompañan (tocar de nuevo los quita). El entrenador principal no aparece entre los ayudantes.
4. **Guardar cambios**. Si otra tablet eliminó la ficha elegida, un modal lo informa ("El entrenador elegido ya no existe.").

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
2. Elegir la división (viene preseleccionada la del filtro de división, o la división activa del Dashboard), el rival (escrito o tocando un chip de **Rivales de esta división**), la fecha y hora, la condición, el torneo y el estadio.
3. Opcional: en **Plantel rival**, revisar los jugadores del rival y agregar, corregir o quitar los que haga falta (ver [Partidos](#partidos-matches)).
4. Pulsar **Crear partido**. El partido queda **Programado** y se ordena por fecha; los cambios del plantel rival se guardan en ese momento.

### Armar la convocatoria y el quinteto, e iniciar el partido

1. En la tarjeta del partido, pulsar **Armar quinteto**.
2. En **Convocatoria**, tocar jugadores para sumarlos o quitarlos (máximo 12; si se supera, un modal lo indica).
3. En **Quinteto inicial**, tocar exactamente 5 convocados para marcarlos como titulares (el resto queda en "Banco").
4. Revisar los mensajes del panel de estado hasta ver "Convocatoria y quinteto listos para el salto inicial".
5. Pulsar **Iniciar partido**. Si algo no cumple las reglas, un modal lista los problemas. Si todo es válido, el partido pasa a **En vivo** y se abre la consola.

### Tiempos muertos

1. Pulsar **TM** en el panel del equipo (propio o rival).
2. Confirmar en el modal, que indica cuántos quedan en la mitad, en el suplementario o en los últimos 2 minutos del 4.º cuarto.
3. El reloj se detiene y un aviso muestra los tiempos restantes. Sin tiempos disponibles, el modal "Sin tiempos muertos" lo informa y no se descuenta nada.
4. Con el reloj del 4.º cuarto en 2:00 o menos, cada equipo puede usar como máximo 2 tiempos muertos (FIBA): si le quedaban 3, el botón muestra 2 y el tercero se pierde.
5. Durante el entretiempo no se pueden pedir tiempos muertos.

### Reloj y cambio de período

- El reloj arranca en pausa al entrar. Pulsar **Iniciar** (icono `Play`) para que corra.
- **-10s** y **+10s** corrigen el reloj, siempre dentro de la duración del período.
- Tocar otro período en el selector pide confirmación, reinicia el reloj (10:00 o 05:00) e informa si las faltas de equipo vuelven a cero o se mantienen. Pasar de la primera mitad (1.º o 2.º cuarto) a cualquier período posterior lleva primero al entretiempo, con el 2.º cuarto en 00:00; desde ahí solo se puede seguir con **Comenzar 3.er cuarto**.
- Los suplementarios se habilitan de a uno desde el 4.º cuarto.
- Cuando el reloj llega a 00:00:
  - En el 1.º y el 3.er cuarto: el sistema ofrece pasar al período siguiente.
  - En el 2.º cuarto: ofrece pasar al entretiempo; desde ahí, **Comenzar 3.er cuarto**.
  - Al final del 4.º cuarto o de un suplementario, sin empate: ofrece finalizar el partido.
  - Con empate: ofrece el siguiente suplementario. Si el empate llega al final del 4.º suplementario, solo muestra un aviso.

### Faltas del rival

En la barra de herramientas, **Falta** registra una falta personal del rival, sin jugador: enciende sus luces de faltas y su **Bonus**. **Deshacer falta**, al lado, quita la última falta del rival, aunque sea de un período anterior, y recalcula las luces y el bonus. Está deshabilitado mientras el rival no tiene faltas; si otra tablet quitó la última mientras tanto, el aviso dice "No hay faltas del rival para deshacer." Los dos botones no aparecen en el entretiempo ni en modo lectura.

La barra no suma puntos al rival: sus puntos llegan con cada entrada de **Puntos recibidos** (ver [Qué no cambia la planilla](#qué-no-cambia-la-planilla)).

### Deshacer

**Deshacer**, en **Últimas entradas**, quita la última entrada de la planilla y, si sumó puntos, también su jugada de puntos. **Deshacer falta** quita la última falta del rival. El marcador y las faltas se recalculan desde las jugadas, así que deshacer funciona aunque sea de un período anterior. Los tiempos muertos y los cambios de período no se deshacen.

Con varias tablets en el mismo partido, cada **Deshacer** quita la última de la lista, que puede haber cargado otra tablet. No se borra del servidor: queda marcada como eliminada y desaparece también en las demás tablets (ver [Sincronización](#sincronización)).

### Finalizar el partido

1. Pulsar **Finalizar** en la barra de herramientas, o aceptar la propuesta del sistema cuando el reloj llega a 00:00.
2. Confirmar en el modal, que muestra el resultado final.
3. El partido pasa a **Finalizado**, no admite más jugadas y se abre su planilla estadística.

### Leer la planilla del partido

1. Abrir **Planilla box score** desde Partidos, **Planilla** desde la consola o un resultado del Dashboard.
2. Revisar la sección **Planilla** (ver [Leer la planilla táctica](#leer-la-planilla-táctica)), los parciales por período y el box score.
3. En el **Box score**, ver los puntos de cada convocado y del equipo, con los tiros libres, dobles y triples convertidos.

### Editar los códigos de la planilla

1. Abrir **Planilla** en el menú (pantalla [Códigos de la planilla](#códigos-de-la-planilla-chart-codes)). Hace falta el permiso `MANAGE_CHART_CATALOG`.
2. Para renombrar, tocar el lápiz del código, cambiar el símbolo, el nombre o el tono y pulsar **Guardar cambios**.
3. Para agregar, pulsar **Nuevo código** en la categoría, completar el formulario y pulsar **Agregar código**. El código aparece al final de la categoría en el panel de carga en vivo.
4. Para dejar de usar un código, tocar **Archivar** y confirmar. Las entradas ya cargadas lo siguen mostrando; **Restaurar** lo devuelve al panel.

### Cargar el plantel de un rival

1. Abrir **Rivales** en el menú o, en el teléfono, el botón **Rivales** de Partidos (pantalla [Rivales](#rivales-rivals)). Hace falta el permiso `MANAGE_MATCHES`.
2. Pulsar **Nuevo rival**, elegir la división y escribir el nombre igual que en los partidos (por ejemplo, "Obras Sanitarias"). Pulsar **Crear rival**.
3. En la tarjeta del rival, pulsar **Agregar jugador**, completar dorsal, nombre y apellido y pulsar **Agregar jugador**. Repetir por cada jugador.
4. Revisar la línea del enlace: debe decir "1 partido con este nombre" (o más). Si dice "Ningún partido con este nombre", renombrar el rival con el lápiz.
5. En la consola en vivo de ese partido, en **Puntos recibidos** y **Acciones ofensivas**, aparece el paso **Rival (opcional)** con los jugadores cargados.

También se puede cargar desde el formulario del partido (crear o editar): con la división elegida y el nombre del rival escrito, la sección **Plantel rival** muestra el plantel o permite armarlo, y el rival se crea al guardar el partido (ver [Partidos](#partidos-matches)). Como el nombre es el mismo del partido, el enlace queda hecho.

---

## 7. Reglas FIBA aplicadas

| Regla                | Implementación                                                                                                                                                                                                                                                                            | Código                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Bonus de equipo      | Con 4 o más faltas de equipo en el período se enciende **Bonus**. Las faltas de cualquier suplementario cuentan como parte del 4.º cuarto.                                                                                                                                                | `basketball-rules.ts`, `event-rules.ts` (`isSameTeamFoulPeriod`)                                                                 |
| Tiempos muertos      | 2 en la primera mitad, 3 en la segunda y 1 por cada suplementario. Los no usados no pasan a la mitad siguiente. Al entrar a un suplementario nuevo se repone 1. Con el reloj del 4.º cuarto en 2:00 o menos, como máximo 2 (Art. 18.2.5): si quedaban 3, uno se pierde.                   | `timeouts.ts` (`isLastTwoMinutesOfFourthQuarter`)                                                                                |
| Entretiempo          | Al terminar el 2.º cuarto el partido pasa a `HALFTIME`: no se registran jugadas ni tiempos muertos hasta comenzar el 3.er cuarto. Cualquier salto de la primera mitad a un período posterior pasa por el entretiempo, y finalizar desde el entretiempo guarda el reloj en 00:00. | `match-use-cases.ts` (`startHalftime`, `startThirdQuarter`, `changeQuarter`, `finishMatch`), `game-clock.ts` (`crossesHalftime`) |
| Duración de períodos | 10 minutos por cuarto, 5 por suplementario, hasta 4 suplementarios.                                                                                                                                                                                                                       | `game-clock.ts`                                                                                                                  |
| Convocatoria         | Entre 5 y 12 jugadores, exactamente 5 titulares y todos ellos convocados.                                                                                                                                                                                                                 | `lineup-rules.ts`                                                                                                                |

Fuente única de verdad: el marcador, las faltas de equipo, los parciales y el box score se derivan siempre de la lista de jugadas del partido (`match-derivations.ts`). Los campos guardados en el partido son una copia que se recalcula en cada cambio. Las entradas de la planilla táctica (`CHART`) no suman puntos ni faltas por sí mismas: cuando una entrada lleva puntos (Puntos recibidos o una acción ofensiva convertida), registra además la jugada de puntos correspondiente, enlazada con `chart.scoreEventId`, y esa jugada es la que suma.

---

## 8. Datos, persistencia y sincronización

### Dónde se guardan

| Dato                                                                                                                                         | Ubicación                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Divisiones, equipos, jugadores, entrenadores, rivales, partidos, jugadas y códigos de la planilla del club (copia del servidor)               | PostgreSQL: tablas `sync_records` y `match_events` (ver [Servidor y base de datos](#9-servidor-y-base-de-datos)). |
| Usuarios y sesiones                                                                                                                          | PostgreSQL: tablas `users` (contraseñas con hash scrypt) y `sessions` (solo el hash del token).                   |
| Copia local del club: divisiones, equipos, jugadores, entrenadores, rivales, partidos y jugadas, códigos de la planilla, usuario actual, división y partido activos | `localStorage`, clave `hoop-club-storage` (Zustand con el middleware `persist`).                                  |
| Cola de cambios pendientes (outbox), usuario dueño de esa cola, cursor de sincronización, época de datos, versiones y hora de la última sincronización | `localStorage`, clave `hoop-sync-storage`.                                                                        |
| Perfil del último usuario (id, correo, nombre, rol)                                                                                          | `localStorage`, clave `hoop-auth-storage`. Nunca la contraseña ni el token.                                       |
| Sesión                                                                                                                                       | Cookie `hoop_session` (httpOnly: el JavaScript de la página no puede leerla), 30 días.                            |
| Tema claro u oscuro                                                                                                                          | `localStorage`, clave `hoop-theme`.                                                                               |
| Tutoriales vistos o saltados, por usuario                                                                                                    | `localStorage`, clave `hoop-tour-storage`.                                                                        |
| Pestaña principal cuando el navegador no tiene Web Locks (http en la red local)                                                              | `localStorage`, clave `hoop-sync-leader-lease` (id de la pestaña y vencimiento).                                  |
| Cambios de una pestaña secundaria que la principal todavía no confirmó                                                                       | `localStorage`, una clave por pestaña: `hoop-sync-handoff:<id de pestaña>`.                                       |
| Cola de diálogos, estado del reloj en marcha, estado de la sincronización en curso                                                           | Memoria (no se guarda).                                                                                           |

El reloj de juego se guarda en el partido al pausar, al corregirlo, al llegar a 00:00, con cada jugada o entrada de la planilla, tiempo muerto o finalización, al ocultarse la página y al salir de la consola.

### Versión y migración

El almacenamiento lleva una versión (`CLUB_STORE_VERSION = 4`, en `src/core/application/stores/club-state.ts`). Si el navegador tiene datos de una versión anterior, se descartan y la copia local queda vacía hasta la próxima descarga del servidor, en lugar de fallar. Desde la versión 4 el navegador no trae datos de demostración. Cada cambio en la forma de los datos guardados debe subir esa versión.

La cola de sincronización (`SYNC_STORE_VERSION`, en `useSyncStore.ts`) y el perfil guardado (`AUTH_STORE_VERSION`, en `useAuthStore.ts`) tienen su propia versión. Con una versión vieja, la cola vuelve a empezar vacía, sin cursor ni época (la próxima sincronización descarga todo del servidor y los cambios que tenía no se envían), y el perfil se descarta (hay que volver a iniciar sesión).

### Datos de demostración

Se generan en `src/core/infrastructure/mocks/seed-data.ts`, de forma determinística, y solo se cargan en el servidor con `npm run db:seed` (desarrollo y pruebas). Las fechas se calculan a partir del momento de la carga. Para los datos reales del club se usa la [importación de las actas oficiales](#importar-las-actas-oficiales), que reemplaza todo lo anterior.

| Elemento                | Contenido                                                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Club                    | Club Atlético Monte Grande (`club-camg`), temporada 2025/2026.                                                                                                                                |
| Usuarios                | 5, con correos `@camg.com.ar`: Federico Balbi, Sergio Hernández y Julio Lamas (entrenadores principales), Mariano Ginóbili (asistente planillero) y Alejandro Montecchia (administrador).     |
| Divisiones y equipos    | Primera División, Sub-19 (U19) y Sub-17 (U17), cada una con su equipo `Club Atlético Monte Grande - <división>` y su entrenador.                                                              |
| Jugadores               | 17: 12 de Primera (uno lesionado, con parte médico), 3 de Sub-19 y 2 de Sub-17.                                                                                                               |
| Partidos finalizados    | 3, con jugada a jugada completa: contra Peñarol de Mar del Plata (local), Quimsa (visitante) y Ferro Carril Oeste (local), hace 20, 13 y 6 días.                                              |
| Partido en vivo         | Contra Obras Sanitarias, hoy, en el Estadio CAMG: 2.º cuarto con 07:08 en el reloj y el rival en bonus.                                                                                       |
| Planilla táctica        | Los partidos finalizados y el partido en vivo traen entradas de la planilla en cada cuarto jugado (entre 6 y 14 por cuarto completo, de las cuatro categorías), atadas a jugadas del partido. |
| Catálogo de la planilla | Sin cambios: los códigos de fábrica, sin códigos propios ni archivados.                                                                                                                       |
| Planteles rivales       | En Primera División: Obras Sanitarias (12 jugadores, el rival del partido en vivo) y Ferro Carril Oeste (10 jugadores, el rival del último partido finalizado).                               |
| Partido programado      | Contra Boca Juniors como visitante, dentro de 7 días, con convocatoria precargada.                                                                                                            |

El navegador no los trae: empieza vacío y en la primera sincronización de una tablet recibe la copia del servidor. Los cambios que alguien haya hecho antes de esa primera sincronización no se pierden: se vuelven a aplicar sobre la copia del servidor y se envían.

### Volver a los datos del servidor en una tablet

La fuente de verdad es el servidor. Para que una tablet descarte su copia local y vuelva a descargar todo:

1. Esperar a que el estado diga **Sincronizado** (si no, los cambios pendientes se pierden).
2. Pulsar **Cerrar sesión** y volver a iniciar sesión: la primera sincronización descarga todo de nuevo.

Como alternativa, en las herramientas de desarrollo del navegador se pueden borrar las claves `hoop-club-storage` y `hoop-sync-storage` de `localStorage` y recargar. No hay un botón para reiniciar la copia local.

### Sincronización

Cómo funciona para quien usa la aplicación:

| Situación                                                                                        | Qué hace Hoop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cualquier cambio (crear un jugador, registrar una jugada, mover el reloj)                        | Se guarda al instante en la tablet y entra en la cola de salida. Medio segundo después se envía al servidor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Sin conexión                                                                                     | Todo sigue funcionando igual. El estado muestra **Sin conexión** y cuántos cambios esperan. La cola se guarda en el navegador y sobrevive a recargas y reinicios.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Cambios antes de la primera sincronización (tablet nueva o sin conexión desde el primer ingreso) | También entran en la cola y el estado los cuenta como pendientes. Cuando llega la primera copia completa del servidor, reemplaza los datos locales y los cambios pendientes se vuelven a aplicar encima; después se envían.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Vuelve la conexión                                                                               | La cola se envía sola y la tablet descarga lo que cambiaron las demás. Si el servidor no responde, reintenta cada vez más espaciado (1 s, 2 s, 4 s... hasta 60 s).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Otra tablet guarda un cambio                                                                     | Esta tablet le pregunta al servidor por cambios cada 10 segundos mientras alguna pestaña de la aplicación está visible en este navegador, y al instante cuando una pestaña vuelve a verse, cuando vuelve la conexión y después de cada envío. Con todas las pestañas ocultas o la tablet bloqueada deja de preguntar. El cambio llega en unos segundos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Dos tablets editan el mismo jugador, división, entrenador o código de la planilla                | Gana el cambio más reciente según la hora en que se hizo (last-write-wins) y el registro se reemplaza completo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Dos tablets editan el mismo partido                                                              | Se combinan campo por campo: cada dato del partido (tiempos muertos, quinteto, estadio, etc.) guarda la hora de su último cambio y gana el más reciente; con la misma hora queda el del servidor. Si una tablet maneja el reloj y otra corrige el estadio, se conservan los dos cambios. El estado, el período y el reloj forman un solo grupo (el estado de juego): gana completo el de la tablet que lo cambió último, así que nunca se mezcla el período de una tablet con el reloj de otra (por ejemplo, "2.º cuarto con 0:20" cuando una tablet pasó al 2.º cuarto y otra pausó el 1.º en 0:20). Los tiempos muertos de cada equipo también son un solo dato: si dos tablets piden a la vez un tiempo muerto del mismo equipo, queda el pedido más reciente. Eliminar un partido gana solo si es posterior a todos sus cambios. |
| Varias pestañas abiertas en el mismo navegador                                                   | Solo una pestaña (la principal) sincroniza y guarda los datos en el navegador, también por http en la red local. Las demás muestran lo que guarda la principal y le envían sus cambios al instante. Si se cierra la principal, otra pestaña toma su lugar sola, sin perder cambios: lo que una pestaña secundaria cambió y la principal no llegó a confirmar queda guardado en el navegador, y la próxima pestaña principal lo envía aunque la secundaria ya se haya cerrado.                                                                                                                                                                                                                                                                                                                                                        |
| Jugadas                                                                                          | Nunca se pisan: cada jugada tiene su propio ID y se suma a la lista, ordenada por hora y luego por ID. Dos tablets pueden cargar jugadas del mismo partido a la vez sin perder ninguna. El marcador y las faltas se recalculan con todas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Deshacer** una entrada o una falta                                                                  | La jugada queda marcada como eliminada en el servidor (no se borra) y desaparece en todas las tablets. Una jugada eliminada no vuelve.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| El servidor rechaza un cambio                                                                    | Si el rol no tiene permiso o el dato no es válido, el cambio se descarta y el estado muestra **Error** con la cantidad de cambios rechazados. Si el servidor tiene una versión más nueva, se descarta el cambio local y se descarga la del servidor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Jugadas de un partido que el servidor no tiene                                                   | El servidor las rechaza: una jugada solo se acepta si su partido existe (o llega en el mismo envío) y no está eliminado. La tablet envía siempre el partido antes que sus jugadas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| La cuenta debe cambiar su contraseña temporal                                                    | No sincroniza: el servidor rechaza envíos y descargas (403) hasta que la cuenta [cambie su contraseña](#cambiar-contraseña-accountpassword). Después del cambio la sincronización arranca sola. |
| La sesión venció                                                                                 | La aplicación pide iniciar sesión de nuevo. Si vuelve a entrar la misma cuenta, la cola se conserva y se envía después del ingreso.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Otra persona inicia sesión en la misma tablet                                                    | La cola guarda quién hizo los cambios. Si entra una cuenta distinta, los cambios pendientes de la anterior se descartan (nunca se envían con la identidad de otra persona), un aviso informa "Se descartaron N cambios sin sincronizar de <nombre>" y la tablet descarga todo de nuevo del servidor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Los datos del servidor se reemplazaron (por ejemplo, al [importar las actas](#importar-las-actas-oficiales)) | El servidor cambia su época de datos y rechaza los envíos hechos sobre los datos anteriores. La tablet descarta su copia local, su cola de cambios y su cursor, y descarga todo de nuevo. Los cambios sin sincronizar se pierden: el estado muestra **Error** con el aviso "Los datos del servidor se reemplazaron: se descartaron N cambios sin sincronizar de este dispositivo." Los datos viejos de un navegador nunca vuelven al servidor. |
| Se reinició la base del servidor                                                                 | Cuando la tablet detecta que el servidor volvió atrás (con el próximo envío), descarga todo de nuevo, reemplaza su copia y vuelve a aplicar encima los cambios pendientes, que se envían a continuación.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Detalle técnico:

- La aplicación compara el estado anterior y el nuevo del store para detectar entidades creadas, editadas o eliminadas y jugadas nuevas o eliminadas. A cada registro le pone `updatedAt` (hora del cambio, siempre posterior a la versión anterior de ese registro) y lo guarda en la cola: un solo cambio pendiente por registro (`tipo:id`) y por jugada. En un partido se marcan con esa hora solo los campos que cambiaron (`fieldVersions`); el marcador y las faltas no se versionan porque se recalculan desde las jugadas.
- Fusión por campo de partidos (`src/core/application/sync/match-fields.ts`): la misma función se usa en el servidor al recibir y en la tablet al descargar. `status`, `currentQuarter` y `quarterTimeRemainingSeconds` comparten una sola versión, `game-state` (`MATCH_FIELD_GROUPS`): un lado gana los tres juntos. `homeTimeouts` y `awayTimeouts` se versionan cada uno como un objeto completo. Los registros sin versiones por campo (anteriores a S13.1) cuentan con `updatedAt` en todos los campos; las versiones por campo guardadas antes del grupo (`status`, `currentQuarter`, `quarterTimeRemainingSeconds`) se toman como `game-state` con la más reciente de las tres.
- Una sola pestaña sincroniza (`tab-coordinator.ts`): elección con el Web Lock `hoop-sync-leader` o, sin Web Locks (la aplicación servida por http en la red local), con un lease en `localStorage` (`leader-lease.ts`, clave `hoop-sync-leader-lease`): la principal lo renueva cada 2 s por 6 s; otra pestaña lo toma solo cuando venció o se liberó (cierre de sesión o cierre de la pestaña, evento `pagehide`) y lidera si su reclamo sigue siendo suyo 200 ms después. Si el navegador congela la pestaña principal más de 6 s, otra toma su lugar y la congelada pasa a secundaria al despertar. Mientras no se sabe qué rol tiene, una pestaña no escribe `hoop-club-storage` ni `hoop-sync-storage`. Las secundarias tampoco: los recargan con el evento `storage` y envían sus cambios por `BroadcastChannel` hasta que la principal los confirma; mientras tanto los guardan en `hoop-sync-handoff:<id de pestaña>` (`edit-handoff.ts`), que la siguiente pestaña principal vacía y envía (los de otro usuario se descartan). Sin `BroadcastChannel`, o sin Web Locks y con un `localStorage` que no permite escribir, cada pestaña sincroniza por su cuenta.
- Un envío (`POST /api/sync/push`) lleva como máximo 500 registros y 2000 jugadas. Una eliminación viaja como marca (tombstone) con los últimos datos conocidos. Los partidos viajan sin jugadas; las jugadas van aparte.
- La descarga (`GET /api/sync/pull?since=<cursor>`) trae todo lo que cambió después del cursor, de a páginas, y se aplica una sola vez al final. Lo descargado no vuelve a entrar en la cola.
- Sin cursor (primera sincronización o reinicio de la base) primero se descarga la copia completa y después se envía la cola. La copia reemplaza los datos locales y la cola se vuelve a aplicar encima (`applyServerSnapshot`): registros pendientes creados, editados o eliminados, jugadas nuevas agregadas y jugadas eliminadas quitadas; luego se recalculan los marcadores. Un registro pendiente del que el servidor ya tiene una versión igual o más nueva se descarta, igual que en una descarga normal.
- Época de datos (`epoch`): el servidor guarda un identificador de sus datos y lo devuelve en cada descarga; cada envío lleva el de la última descarga. Si falta o no coincide (los datos se reemplazaron), el servidor rechaza el envío con 409 y la tablet vacía su copia local, la cola, el cursor y las versiones, y descarga una copia completa. Una descarga con otra época tampoco se mezcla con los datos locales. Nada se envía mientras la tablet no conoce la época.
- La cola tiene dueño (`owner`: id y nombre del usuario). Antes de arrancar la sincronización, `resolveSyncOwnership` (en `src/core/application/sync/sync-owner.ts`) decide: sin dueño o mismo usuario, la cola se conserva; otro usuario, se vacían cola, cursor y versiones.
- Descarga periódica (polling, `SYNC_POLL_INTERVAL_MS` en `src/core/application/sync/sync-engine.ts`): el servidor no mantiene conexiones abiertas (corre en funciones serverless), así que la tablet pregunta por cambios con `GET /api/sync/pull`. Pregunta al arrancar, cada 10 s mientras alguna pestaña de la aplicación está visible en el navegador (`document.visibilityState`; con todas ocultas se pausa), al instante cuando una pestaña vuelve a verse o vuelve la conexión, y justo después de cada envío. Solo pregunta la pestaña principal, porque el motor corre solo en ella; las demás reciben los datos por `localStorage`. Para que la principal siga preguntando aunque esté oculta detrás de otra pestaña visible, cada pestaña avisa por `BroadcastChannel` si está visible (`tab-visibility.ts`): al cambiar, cada 5 s mientras se ve y cuando aparece una nueva principal; una pestaña que deja de avisar (cerrada o congelada) cuenta como oculta a los 15 s. Si una descarga falla, la espera creciente de los reintentos manda y no se suman consultas extra.
- Código: `src/core/application/sync/` (núcleo puro y probado), `src/core/infrastructure/sync-api/` (llamadas HTTP validadas con Zod, conectividad y visibilidad de la página) y `src/presentation/session/` (arranque, sesión y cierre de sesión).

---

## 9. Servidor y base de datos

El servidor es la propia aplicación Next.js: las rutas `src/app/api/**` atienden el inicio de sesión y la sincronización, y el código de servidor vive en `src/server/**` (nunca llega al navegador). Los datos están en PostgreSQL 17.

### Base de datos con Docker

| Paso                                                                                     | Comando              |
| ---------------------------------------------------------------------------------------- | -------------------- |
| Levantar PostgreSQL (contenedor `db`, volumen `hoop-pgdata`, puerto solo en `127.0.0.1`) | `npm run db:up`      |
| Crear o actualizar las tablas                                                            | `npm run db:migrate` |
| Cargar el club de demostración y las cuentas                                             | `npm run db:seed`    |
| Correr las pruebas de integración                                                        | `npm run test:db`    |
| Detener el contenedor (los datos quedan en el volumen)                                   | `npm run db:down`    |

### Variables de entorno

Se definen en `.env.local` (no se sube al repositorio; `.env.example` documenta los valores por defecto). Las variables del sistema tienen prioridad.

| Variable                                                             | Para qué                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Valor por defecto o ejemplo                     |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `DATABASE_URL`                                                       | Conexión de la aplicación, las migraciones y el seed. Obligatoria.                                                                                                                                                                                                                                                                                                                                                                                        | `postgres://hoop:hoop@127.0.0.1:5432/hoop`      |
| `DATABASE_POOL_MAX`                                                  | Conexiones a la base por instancia del servidor. Pocas a propósito: en hosting serverless corren varias instancias a la vez y el pooler de Supabase admite pocas conexiones. Si falta, 3.                                                                                                                                                                                                                                                                 | `3`                                             |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` | Base, usuario, contraseña y puerto local del contenedor de `docker-compose.yml`. Deben coincidir con `DATABASE_URL`.                                                                                                                                                                                                                                                                                                                                      | `hoop`, `hoop`, `hoop`, `5432`                  |
| `SEED_DEMO_PASSWORD`                                                 | Contraseña de las cuentas de demostración que crea `npm run db:seed`.                                                                                                                                                                                                                                                                                                                                                                                     | `camg1922`                                      |
| `TEST_DATABASE_URL`                                                  | Base de `npm run test:db`. Si falta, se usa `DATABASE_URL` con `_test` al final del nombre (por ejemplo `hoop_test`), que se crea sola. Nunca toca los datos de desarrollo.                                                                                                                                                                                                                                                                               | `postgres://hoop:hoop@127.0.0.1:5432/hoop_test` |
| `SESSION_COOKIE_SECURE`                                              | Fuerza el atributo `Secure` de la cookie de sesión: `true` o `false`. Sin definir, es seguro en producción y no en desarrollo. Poner `false` cuando las tablets entran a una compilación de producción por `http` en la red del club (por ejemplo `http://192.168.0.10:3000`): el navegador descarta las cookies `Secure` en `http` y el inicio de sesión no quedaría guardado. Solo en una red de confianza; detrás de HTTPS dejar el valor por defecto. | sin definir                                     |

### Datos de demostración en el servidor

`npm run db:seed` carga el mismo club de demostración de la [sección 8](#datos-de-demostración) y las [cuentas de demostración](#cuentas-de-demostración). Con los datos del club solo inserta: nunca sobrescribe ni revive registros o jugadas que ya existen (tampoco los que alguien eliminó), así que se puede correr varias veces sin pisar lo cargado por los usuarios. Al terminar informa cuántos registros y jugadas nuevos insertó (`recordsInserted`, `eventsInserted`) y lista las cuentas. Las cuentas de demostración, en cambio, se actualizan por ID: cada corrida restablece su nombre, correo y rol, y su contraseña a la de `SEED_DEMO_PASSWORD`; no cambia si están activas ni si deben cambiar la contraseña. Las cuentas creadas desde [Usuarios](#usuarios-users) no se tocan.

### Importar las actas oficiales

Los datos reales del club salen de las actas oficiales de los partidos (`Acta-Partido-<número>.pdf`) y de la planilla extraída de ellas (CSV). El detalle de las opciones está en el README.

```bash
npm run db:import-actas -- --csv <planilla.csv> --pdfs <carpeta> --dry-run   # valida y muestra el resumen, sin conectarse a la base
npm run db:import-actas -- --csv <planilla.csv> --pdfs <carpeta> --yes       # borra y carga
```

- En una sola transacción borra todos los registros, jugadas, sesiones y cuentas excepto `admin@camg.com.ar` (su contraseña no cambia; si la cuenta no existe, no se modifica nada), cambia la época de datos del servidor y carga la división, el equipo propio con sus jugadores (licencia, dorsal y nombre como en el acta) y sus entrenadores, los rivales con sus planteles y los partidos finalizados con su [resultado oficial](#planilla-estadística-matchesidstats) (tanteo final y puntos por cuarto). No se cargan jugadas: la planilla y el box score de esos partidos quedan vacíos.
- Los navegadores con datos o cambios anteriores los descartan y descargan todo de nuevo; los cambios sin sincronizar se pierden, con un aviso (ver [Sincronización](#sincronización)).
- La importación falla con la lista completa de problemas si un acta no coincide con la planilla (equipos, tanteo final o cuartos que no suman el final).
- Las actas y la planilla tienen datos personales: no se guardan en el repositorio.

### API

| Ruta                                | Qué hace                                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/login`              | `{ email, password }` en JSON. Responde `{ user }` y crea la cookie de sesión, o 401 con "Email o contraseña incorrectos".                                              |
| `POST /api/auth/logout`             | Cierra la sesión y borra la cookie. Exige `Content-Type: application/json` (cuerpo `{}`); sin él responde 415.                                                          |
| `GET /api/auth/me`                  | El usuario de la sesión (`id`, `email`, `name`, `role`, `mustChangePassword`) o 401.                                                                                    |
| `POST /api/auth/password`           | `{ currentPassword, newPassword }` (nueva de 8 a 256 caracteres). Responde `{ user }` con `mustChangePassword` en `false` y cierra las demás sesiones de la cuenta; 400 con `reason: WRONG_CURRENT_PASSWORD` si la actual no coincide y 400 `SAME_PASSWORD` si la nueva es igual a la actual. |
| `GET /api/users`                    | Solo `MANAGE_USERS`. `{ users: [{ id, email, name, role, active, mustChangePassword, createdAt }] }`, por nombre. Nunca devuelve datos de contraseñas.                  |
| `POST /api/users`                   | Solo `MANAGE_USERS`. `{ name, email, role, temporaryPassword }` -> 201 `{ user }` (activa y con cambio obligatorio); 409 `EMAIL_TAKEN`.                                  |
| `PATCH /api/users/[id]`             | Solo `MANAGE_USERS`. `{ name?, email?, role?, active? }` -> `{ user }`; 404 `USER_NOT_FOUND`; 409 `EMAIL_TAKEN`, `SELF_DEACTIVATION`, `SELF_ROLE_CHANGE` o `LAST_ADMIN`. Desactivar cierra las sesiones de la cuenta. |
| `POST /api/users/[id]/password`     | Solo `MANAGE_USERS`. `{ temporaryPassword }` -> `{ user }`: marca el cambio obligatorio y cierra todas las sesiones de la cuenta (también la propia si es la del administrador); 404 `USER_NOT_FOUND`. |
| `POST /api/sync/push`               | Recibe registros (los partidos con `fieldVersions` opcional: campo -> hora de su último cambio) y jugadas; responde `{ accepted, rejected: [{ id, reason }], cursor }`. |
| `GET /api/sync/pull?since=<cursor>` | Cambios posteriores al cursor (incluye eliminaciones), de a páginas (`hasMore`). Sin `since`, todo.                                                                     |

Los errores responden `{ error, reason? }`: `error` es el mensaje en español que la aplicación muestra tal cual y `reason`, el código para reaccionar. Mientras la cuenta debe cambiar su contraseña temporal, `push`, `pull` y todas las rutas de `/api/users` responden 403 con `reason: PASSWORD_CHANGE_REQUIRED`: un administrador en esa situación no puede usar la API de Usuarios hasta cambiar su contraseña. Si quien hace un cambio en `/api/users` dejó de ser un administrador activo después de validar su sesión, el cambio no se aplica y responde 403 con `reason: ACTOR_NOT_ALLOWED`.

Motivos de rechazo de un cambio en `push`: `INVALID` (datos que no cumplen el esquema del dominio, un `updatedAt` más de 5 minutos adelantado respecto del reloj del servidor, una versión de campo posterior a su `updatedAt`, o una jugada cuyo partido no existe en el servidor ni llega aceptado en el mismo envío), `FORBIDDEN` (el rol no tiene el permiso) y `STALE` (el servidor ya tiene una versión igual o más nueva de todos los campos, o la jugada fue eliminada).

### Seguridad

- Contraseñas con hash scrypt y sal aleatoria; la sesión es un token aleatorio del que el servidor solo guarda el hash.
- Cookie `hoop_session` httpOnly, `SameSite=Lax`, `Secure` en producción (ver `SESSION_COOKIE_SECURE`).
- Mensaje genérico ante credenciales incorrectas: no revela qué correos existen.
- `login`, `logout`, `push`, `POST /api/auth/password` y los cambios de `/api/users` exigen JSON y rechazan con 403 ("Solicitud rechazada: el origen no está permitido.") los pedidos cuyo encabezado `Origin` no coincide con el host del servidor. Detrás de un proxy inverso, el proxy debe enviar `X-Forwarded-Host` (o conservar `Host`).
- Los permisos de cada cambio se validan en el servidor con la misma matriz de roles que usa la interfaz.
- Las cuentas no se borran: desactivar una cierra sus sesiones al instante y bloquea su ingreso con el mismo mensaje genérico. Restablecer una contraseña cierra todas las sesiones de la cuenta; cambiar la propia cierra las demás y conserva la actual.
- Una cuenta con contraseña temporal solo puede cambiarla: el servidor rechaza su sincronización y, si es de un administrador, la gestión de usuarios hasta entonces. Cada cambio de usuarios vuelve a comprobar dentro de su transacción que quien lo hace sigue siendo un administrador activo. El último administrador activo no se puede desactivar ni cambiar de rol, y un administrador no puede desactivar ni cambiar el rol de su propia cuenta.
- `updatedAt` más de 5 minutos en el futuro se rechaza, para que un reloj adelantado no gane todos los conflictos.

### Solución de problemas

| Síntoma                                                                 | Causa probable                                                                                          | Qué hacer                                                                           |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Después de ingresar, la tablet vuelve a la pantalla de inicio de sesión | Compilación de producción servida por `http`: el navegador descarta la cookie `Secure`.                 | Definir `SESSION_COOKIE_SECURE=false` (solo en la red del club) o servir por HTTPS. |
| El estado queda en **Sin conexión** con conexión                        | El servidor no responde o no llega a la base.                                                           | Revisar que la aplicación esté corriendo, `npm run db:up` y `DATABASE_URL`.         |
| "Sin conexión" al iniciar sesión                                        | El primer ingreso necesita el servidor.                                                                 | Conectar la tablet a la red del club.                                               |
| Después de ingresar no hay divisiones ni partidos                       | La base está vacía.                                                                                     | `npm run db:migrate` y `npm run db:seed`.                                           |
| **Error**: "El servidor rechazó N cambios"                              | El rol no tiene permiso, el dato no es válido o el reloj de la tablet está más de 5 minutos adelantado. | Revisar el rol de la cuenta y activar la fecha y hora automáticas en la tablet.     |
| 403 "Solicitud rechazada: el origen no está permitido."                 | Un proxy cambia el `Host` sin enviar `X-Forwarded-Host`.                                                | Configurar el proxy para conservar el host original.                                |
| Una tablet no ve cambios de otra                                        | Pasaron menos de 10 s, la pestaña estuvo oculta o una descarga falló y espera para reintentar.         | Tocar el estado de sincronización para descargar al instante.                       |
| Después de reiniciar la base, una tablet muestra datos viejos           | Todavía no detectó el reinicio (lo hace con el próximo envío).                                          | Cerrar sesión y volver a ingresar.                                                  |
| `npm run test:db` no conecta                                            | Falta `TEST_DATABASE_URL` o `DATABASE_URL`, o el contenedor no está levantado.                          | `npm run db:up` y revisar `.env.local`.                                             |

---

## 10. Identidad visual

### Paleta (tokens de `src/app/globals.css`)

| Token                               | Valor (tema oscuro)   | Uso                                                                           |
| ----------------------------------- | --------------------- | ----------------------------------------------------------------------------- |
| `--brand-primary`                   | `#E31B23`             | Rojo del club: rellenos, botones principales, escudo.                         |
| `--brand-primary-hover` / `-active` | `#B31419` / `#8F1014` | Estados del rojo.                                                             |
| `--brand-primary-ink`               | `#FF3B43`             | Texto rojo sobre fondo oscuro (contraste).                                    |
| `--brand-black`                     | `#111111`             | Negro del club.                                                               |
| `--bg-base`                         | `#0A0A0A`             | Fondo base.                                                                   |
| `--bg-surface-2` / `--bg-surface-3` | `#18181B` / `#27272A` | Superficies.                                                                  |
| `--color-success`                   | `#34D399`             | Conversión, estados correctos.                                                |
| `--color-warning`                   | `#FBBF24`             | Advertencias (por ejemplo, 4 faltas).                                         |
| `--color-danger`                    | `#F87171`             | Peligro en coral, siempre con icono para no confundirse con el rojo del club. |
| `--color-info`                      | `#60A5FA`             | Información.                                                                  |

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

- Animaciones con GSAP (`gsap` y `@gsap/react`), sobre `transform` y `opacity`: entrada de páginas, rebote del marcador, luces de faltas, indicador de bonus, entradas de la planilla y modales.
- Con `prefers-reduced-motion: reduce`, las animaciones GSAP no se ejecutan (`useMotion` usa `gsap.matchMedia`) y las transiciones CSS se reducen al mínimo.

### Tamaños

| Concepto                            | Valores                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Iconos `lucide-react` (`ICON_SIZE`) | 14, 16 (en línea con texto), 20 (navegación y botones), 24 (cabeceras), 32 (estados vacíos y diálogos). |
| Áreas táctiles                      | `--touch-min` 48 px, `--touch-lg` 56 px (consola en vivo), `--touch-xl` 64 px.                          |

---

## 11. Limitaciones conocidas

Resueltas en esta versión: los partidos se combinan campo por campo entre tablets (con el estado, el período y el reloj como un solo grupo), el servidor rechaza jugadas de partidos inexistentes, una sola pestaña sincroniza por navegador (también por http en la red local), la consola en vivo muestra el estado de sincronización, y el entretiempo y la regla de tiempos muertos de los últimos 2 minutos del 4.º cuarto están implementados.

| Limitación                           | Detalle                                                                                                                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sin pruebas E2E de navegador         | Las pruebas cubren el núcleo (dominio, casos de uso, hooks puros, sincronización, coordinación de pestañas, datos de demostración) y el servidor. La interfaz no tiene pruebas automatizadas en navegador. |
| Reinicio de la base                  | La tablet detecta un reinicio de la base del servidor recién con su próximo envío.                                                                                                                         |
| Cambios rechazados                   | Un cambio que el servidor rechaza por permiso o validez se descarta y solo se informa la cantidad, no cuál fue.                                                                                            |
| Correcciones en el entretiempo       | Durante el entretiempo no se puede deshacer la última entrada ni la última falta del rival del 2.º cuarto: hay que comenzar el 3.er cuarto primero.                                                                                      |
| Empate tras el 4.º suplementario     | Si el reloj llega a 00:00 con empate al final del 4.º suplementario, solo se muestra un aviso.                                                                                                             |
| Dorsal repetido                      | No se impide que dos jugadores del mismo equipo usen el mismo dorsal.                                                                                                                                      |
| Contraseña olvidada                  | No hay recuperación por correo: el administrador le asigna una contraseña temporal desde [Usuarios](#usuarios-users).                                                                                     |
| Intentos de contraseña               | No hay límite de intentos ni bloqueo temporal, ni al iniciar sesión ni al escribir la contraseña actual para cambiarla.                                                                                   |
| Cambio de usuario sin conexión       | Si otra cuenta entra en la tablet sin conexión, se descarta la cola de la anterior, pero sus cambios siguen a la vista hasta que llega la copia completa del servidor.                                     |
| Cierre de sesión sin conexión        | La sesión del servidor sigue válida hasta que vence (30 días) o hasta el próximo ingreso en esa tablet. La aplicación lo avisa al cerrar sesión.                                                           |
| Cierre de sesión con varias pestañas | Cerrar sesión en una pestaña no cierra las demás al instante: la pestaña principal pide iniciar sesión con su próximo envío al servidor.                                                                   |

---

## 12. Arquitectura

### Capas (Clean Architecture)

| Capa            | Carpeta                          | Contenido                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dominio         | `src/core/domain/`               | Entidades y esquemas Zod (`entities/`), el club de la instalación (`club-profile.ts`) y reglas puras (`rules/`): FIBA, derivaciones del partido, reloj, tiempos muertos, convocatoria, analítica de temporada y permisos. Sin React ni Zustand.                                                                                                                                                                  |
| Aplicación      | `src/core/application/`          | Casos de uso puros (`use-cases/`: entra un estado, sale uno nuevo o un rechazo tipado), los stores persistidos `useClubStore`, `useSyncStore` y `useAuthStore` (`stores/`), el motor de sincronización y sus reglas puras (`sync/`: diferencias, cola de salida, fusión de lo descargado), la sesión del cliente (`auth/`) y hooks (`hooks/`): `useLiveMatchConsole`, `useGameClock` y su lógica pura testeable. |
| Infraestructura | `src/core/infrastructure/`       | Datos de demostración determinísticos (`mocks/`: semilla, generador de jugadas, PRNG) y adaptadores de la API y del navegador (`sync-api/`: `fetch` con respuestas validadas por Zod, conectividad y visibilidad de la página).                                                                                                                                                                                  |
| Presentación    | `src/presentation/` y `src/app/` | Diseño atómico (`atoms/`, `molecules/`, `organisms/`, `templates/`), movimiento (`motion/`), diálogos (`organisms/DialogHost/`), sesión (`session/`: `SessionProvider` montado en el layout, arranque del motor y cierre de sesión), marca (`brand.ts`) y tamaños de icono (`icon-sizes.ts`). Las rutas viven en `src/app/` (App Router de Next.js).                                                             |
| Servidor        | `src/server/` y `src/app/api/`   | Base de datos (Drizzle + `pg`), autenticación y sesiones, RBAC del servidor y sincronización (push y pull). Marcado `server-only`: nunca se importa desde componentes del cliente. Reutiliza los esquemas y permisos del dominio.                                                                                                                                                                            |

### Regla de dependencias

Las dependencias apuntan hacia adentro: presentación usa aplicación y dominio; aplicación usa dominio; dominio no importa nada de las otras capas. Los casos de uso reciben el ID y la hora desde afuera (`UseCaseContext`), así que son determinísticos y se prueban sin mocks. El store solo orquesta: busca el partido, ejecuta el caso de uso y guarda el resultado si fue exitoso.

El motor de sincronización (`createSyncEngine`) no conoce el navegador: recibe la API, los stores, la conectividad, la visibilidad de la página y los temporizadores como puertos. `src/presentation/session/sync-runtime.ts` es el único lugar que los conecta.

### Árbol resumido

```text
src/
  app/                      rutas: /, /divisions, /players, /matches,
                            /matches/live, /matches/[id]/{lineup,live,stats},
                            /chart-codes, /rivals, /coaches, /help
                            /login, /api/auth/*, /api/sync/*
  core/
    domain/                 entities/, rules/, club-profile.ts
    application/            use-cases/, stores/, hooks/, sync/, auth/
    infrastructure/         mocks/ (semilla), sync-api/ (fetch, navegador)
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

1. Agregar el valor a `PlayByPlayEventTypeSchema` (`src/core/domain/entities/match.types.ts`).
2. Si suma puntos o cuenta como falta, actualizar `EVENT_POINTS` o `isFoulEvent` (`src/core/domain/rules/event-rules.ts`).
3. Si aparece en el box score, sumarlo a la línea de anotación (`ScoringLine`) en `calculatePlayerBoxScore` y `calculateTeamBoxScore` (`basketball-rules.ts`) y agregar su columna en `BOX_SCORE_COLUMNS` (`src/presentation/organisms/BoxScoreTable/box-score-columns.ts`).
4. Exponerlo en la interfaz: botón en la barra de la consola (`ConsoleToolbar.tsx`).
5. Pruebas en `src/core/domain/rules/*.test.ts` y, si cambia un caso de uso, en `src/core/application/use-cases/match-use-cases.test.ts`.
6. Si cambia la forma de los datos guardados, subir `CLUB_STORE_VERSION`.

### Cómo agregar un código de la planilla

Un club agrega sus propios códigos desde la pantalla [Códigos de la planilla](#códigos-de-la-planilla-chart-codes), sin tocar el código fuente. Para sumar un código de fábrica, para todos los clubes:

1. Agregarlo a `CHART_CATALOG` (`src/core/domain/entities/chart.types.ts`) con su símbolo, su etiqueta y su tono. El id (`code`) se guarda en cada entrada: no se renombra ni se reutiliza. El símbolo y la etiqueta sí pueden cambiar.
2. La consola, la grilla y las referencias leen el catálogo del club (`resolveChartCatalog`, en `src/core/domain/rules/chart-catalog.ts`: los códigos de fábrica con los cambios del club, más sus códigos propios), así que lo toman sin más cambios.
3. Agregarlo a la tabla de [Códigos de la planilla](#códigos-de-la-planilla) de este manual.

### Cómo agregar o cambiar una regla

1. Escribir la regla como función pura en `src/core/domain/rules/` (un módulo por tema; se importa directo, sin archivos `index.ts`).
2. Escribir primero su prueba en un archivo `*.test.ts` junto a ella.
3. Usarla desde un caso de uso en `src/core/application/use-cases/` (con su prueba) y, si hace falta, desde un hook.
4. Las pantallas solo leen el resultado: no deben recalcular reglas por su cuenta.

### Estrategia de pruebas

- Runner: `node:test` con `node:assert`, ejecutado por `tsx` (`npm test`). Los archivos `*.test.ts` viven junto al código que prueban.
- Cubren: reglas FIBA (faltas de equipo, bonus, box score), reloj y períodos, tiempos muertos, convocatoria, permisos, clasificación de jugadas, esquemas, derivación del marcador y parciales, analítica de temporada, casos de uso de club y de partido, estado del store y migración, reducer del reloj, reglas de la consola, columnas del box score, planilla táctica (catálogo, carga, deshacer y grilla), integridad e identidad de los datos de demostración.
- Sincronización del cliente: diferencias entre estados, coalescencia de la cola, límites del envío, resultado del envío (aceptado, `STALE`, `FORBIDDEN`, `INVALID`), fusión last-write-wins, eliminaciones, orden de jugadas, primera sincronización, cambios hechos antes de la primera sincronización, cola reaplicada sobre la copia completa, reinicio del cursor, dueño de la cola al cambiar de usuario, motor (debounce, reintentos con espera creciente, 401, sin conexión, consultas periódicas solo con alguna pestaña visible y solo en la pestaña principal), cierre de sesión sin conexión, destino seguro tras el ingreso, adaptador HTTP y textos del indicador.
- Servidor: hash de contraseñas, sesiones, RBAC, esquemas de la API, reglas de fusión, tamaño del pool de la base y, con `npm run test:db`, integración contra PostgreSQL.
- No cubren: componentes React ni flujos en navegador.
- Controles de calidad antes de integrar: `npx tsc --noEmit`, `npm run lint`, `npm test` y `npm run build`.

---

## 13. Glosario

| Término                          | Significado                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Bonus                            | Situación de penalización del equipo con 4 o más faltas de equipo en el período.                                   |
| TL                               | Tiro libre (1 punto).                                                                                              |
| 2P / T2                          | Tiro de campo de 2 puntos (doble).                                                                                 |
| 3P / T3                          | Tiro de campo de 3 puntos (triple).                                                                                |
| TC                               | Tiros de campo totales (T2 + T3).                                                                                  |
| REB, AST, ROB, TAP, PER, FAL     | Rebotes, asistencias, robos, tapas, pérdidas y faltas.                                                             |
| PPG, RPG, APG                    | Puntos, rebotes y asistencias por partido.                                                                         |
| TM                               | Tiempo muerto.                                                                                                     |
| 1C a 4C, S1 a S4                 | Cuartos y suplementarios.                                                                                          |
| Convocatoria / lista de buena fe | Jugadores habilitados para un partido (5 a 12).                                                                    |
| Quinteto inicial                 | Los 5 titulares que empiezan el partido.                                                                           |
| Convocado                        | Juvenil sumado al plantel de otro equipo (por ejemplo, Primera) sin dejar su división.                             |
| Jugada a jugada (play-by-play)   | Lista ordenada de jugadas del partido; fuente única del marcador y las estadísticas.                               |
| Offline-first                    | Diseño en el que la aplicación funciona sin conexión y guarda todo localmente.                                     |
| Outbox (cola de salida)          | Cola persistente de cambios pendientes de enviar al servidor (`hoop-sync-storage`).                                |
| LWW (last-write-wins)            | Estrategia de fusión en la que gana el cambio más reciente según `updatedAt`.                                      |
| Tombstone (marca de eliminación) | Registro o jugada marcado como eliminado en lugar de borrarse, para que la eliminación llegue a todas las tablets. |
| Cursor                           | Posición de la última descarga: la siguiente trae solo lo que cambió después.                                      |
| Polling (consulta periódica)     | La pestaña principal pregunta al servidor por cambios cada 10 s mientras alguna pestaña está visible.              |
| RBAC                             | Control de acceso basado en roles.                                                                                 |
| Versión por campo                | Hora del último cambio de cada dato de un partido; permite combinar ediciones de distintas tablets sin pisarse.    |
| Pestaña principal                | La única pestaña del navegador que sincroniza y guarda los datos; las demás le envían sus cambios.                 |
| Entretiempo                      | Descanso tras el 2.º cuarto (`HALFTIME`): sin jugadas ni tiempos muertos hasta comenzar el 3.er cuarto.            |
| Planilla táctica                 | Planilla del entrenador cargada en vivo: pérdidas, puntos recibidos, acciones ofensivas y defensivas, con jugador, período y reloj. |
| EQ                               | En la grilla de la planilla, entrada del equipo (sin jugador).                                                     |
| Acta / resultado oficial         | Acta oficial del partido. Su tanteo final y sus puntos por cuarto se muestran cuando el partido no tiene jugadas de puntos. |
| Época de datos                   | Identificador de los datos del servidor; cambia cuando se reemplazan (importación de actas) y deja afuera los datos viejos de los navegadores. |
