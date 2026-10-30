# T13 manual replacement texts (from the T13 worker report)

Apply to docs/MANUAL.md section by section. Section numbers refer to the current manual.

## §4 "Estado de sincronización", first paragraph

Botón visible en el riel lateral (tablet), en la barra superior (teléfono), en el menú de usuario del Dashboard y en la barra de herramientas de la consola en vivo. Tocarlo sincroniza en ese momento; en una pestaña secundaria le pide a la pestaña principal que sincronice.

## §4 "Consola en vivo", "Barra de herramientas" row

| Barra de herramientas | **Partidos** (volver), acciones del rival (**+1**, **+2**, **+3**, **Falta**), estado de sincronización (compacto), **Planilla** y **Finalizar**. |

## §4 "Consola en vivo", new paragraph after the table (before "Sin el permiso `RECORD_LIVE`...")

**Entretiempo.** Al terminar el 2.º cuarto el partido pasa a **Entretiempo**: el tablero muestra "Entretiempo" en lugar del reloj, un aviso indica que no se registran jugadas ni tiempos muertos y el botón **Comenzar 3.er cuarto** reanuda el partido (3.er cuarto, reloj en 10:00, En vivo). Desde el entretiempo también se puede finalizar el partido.

## §5 "Tiempos muertos"

1. Pulsar **TM** en el panel del equipo (propio o rival).
2. Confirmar en el modal, que indica cuántos quedan en la mitad, en el suplementario o en los últimos 2 minutos del 4.º cuarto.
3. El reloj se detiene y un aviso muestra los tiempos restantes. Sin tiempos disponibles, el modal "Sin tiempos muertos" lo informa y no se descuenta nada.
4. Con el reloj del 4.º cuarto en 2:00 o menos, cada equipo puede usar como máximo 2 tiempos muertos (FIBA): si le quedaban 3, el botón muestra 2 y el tercero se pierde.
5. Durante el entretiempo no se pueden pedir tiempos muertos.

## §5 "Reloj y cambio de período"

- **-10s** y **+10s** corrigen el reloj, siempre dentro de la duración del período.
- Tocar otro período en el selector pide confirmación, reinicia el reloj (10:00 o 05:00) e informa si las faltas de equipo vuelven a cero o se mantienen. Pasar del 2.º al 3.er cuarto lleva primero al entretiempo.
- Los suplementarios se habilitan de a uno desde el 4.º cuarto.
- Cuando el reloj llega a 00:00:
  - En el 1.º y el 3.er cuarto: el sistema ofrece pasar al período siguiente.
  - En el 2.º cuarto: ofrece pasar al entretiempo; desde ahí, **Comenzar 3.er cuarto**.
  - Al final del 4.º cuarto o de un suplementario, sin empate: ofrece finalizar el partido.
  - Con empate: ofrece el siguiente suplementario. Si el empate llega al final del 4.º suplementario, solo muestra un aviso.

## §6 "Tiempos muertos" row

| Tiempos muertos | 2 en la primera mitad, 3 en la segunda y 1 por cada suplementario. Los no usados no pasan a la mitad siguiente. Al entrar a un suplementario nuevo se repone 1. Con el reloj del 4.º cuarto en 2:00 o menos, como máximo 2 (Art. 18.2.5): si quedaban 3, uno se pierde. | `timeouts.ts` (`isLastTwoMinutesOfFourthQuarter`) |

## §6 new row after it

| Entretiempo | Al terminar el 2.º cuarto el partido pasa a `HALFTIME`: no se registran jugadas, cambios ni tiempos muertos hasta comenzar el 3.er cuarto. | `match-use-cases.ts` (`startHalftime`, `startThirdQuarter`) |

## §6 delete the line

"No modelado: la restricción FIBA de usar como máximo 2 tiempos muertos en los últimos 2 minutos del 4.º cuarto."

## §7 "Sincronización": replace the "Dos tablets editan lo mismo" row with

| Dos tablets editan el mismo jugador o división | Gana el cambio más reciente según la hora en que se hizo (last-write-wins) y el registro se reemplaza completo. |
| Dos tablets editan el mismo partido | Se combinan campo por campo: cada dato del partido (estado, período, reloj, tiempos muertos, quinteto, estadio, etc.) guarda la hora de su último cambio y gana el más reciente; con la misma hora queda el del servidor. Si una tablet maneja el reloj y otra corrige el estadio, se conservan los dos cambios. Eliminar un partido gana solo si es posterior a todos sus cambios. |
| Varias pestañas abiertas en el mismo navegador | Solo una pestaña (la principal) sincroniza y guarda los datos en el navegador. Las demás muestran lo que guarda la principal y le envían sus cambios al instante. Si se cierra la principal, otra pestaña toma su lugar sola, sin perder cambios. |

## §7 "Sincronización": add a row after "El servidor rechaza un cambio"

| Jugadas de un partido que el servidor no tiene | El servidor las rechaza: una jugada solo se acepta si su partido existe (o llega en el mismo envío) y no está eliminado. La tablet envía siempre el partido antes que sus jugadas. |

## §7 "Detalle técnico": replace the first bullet and add two

- La aplicación compara el estado anterior y el nuevo del store para detectar entidades creadas, editadas o eliminadas y jugadas nuevas o eliminadas. A cada registro le pone `updatedAt` (hora del cambio, siempre posterior a la versión anterior de ese registro) y lo guarda en la cola: un solo cambio pendiente por registro (`tipo:id`) y por jugada. En un partido se marcan con esa hora solo los campos que cambiaron (`fieldVersions`); el marcador y las faltas no se versionan porque se recalculan desde las jugadas.
- Fusión por campo de partidos (`src/core/application/sync/match-fields.ts`): la misma función se usa en el servidor al recibir y en la tablet al descargar. Los registros sin versiones por campo (anteriores a esta versión) cuentan con `updatedAt` en todos los campos.
- Una sola pestaña sincroniza (`tab-coordinator.ts`): elección con el Web Lock `hoop-sync-leader`; las demás pestañas no escriben `hoop-club-storage` ni `hoop-sync-storage`, los recargan con el evento `storage` y envían sus cambios por `BroadcastChannel` hasta que la principal los confirma. Sin Web Locks (por ejemplo, la aplicación servida por http en la red local) o sin `BroadcastChannel`, cada pestaña sincroniza por su cuenta.

## §8 API: `push` row and the rejection paragraph

| `POST /api/sync/push` | Recibe registros (los partidos con `fieldVersions` opcional: campo -> hora de su último cambio) y jugadas; responde `{ accepted, rejected: [{ id, reason }], cursor }`. |

Motivos de rechazo de un cambio en `push`: `INVALID` (datos que no cumplen el esquema del dominio, un `updatedAt` más de 5 minutos adelantado respecto del reloj del servidor, una versión de campo posterior a su `updatedAt`, o una jugada cuyo partido no existe en el servidor ni llega aceptado en el mismo envío), `FORBIDDEN` (el rol no tiene el permiso) y `STALE` (el servidor ya tiene una versión igual o más nueva de todos los campos, o la jugada fue eliminada).

## §10 replace the whole section

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

## §12 Glosario: add rows

| Versión por campo | Hora del último cambio de cada dato de un partido; permite combinar ediciones de distintas tablets sin pisarse. |
| Pestaña principal | La única pestaña del navegador que sincroniza y guarda los datos; las demás le envían sus cambios. |
| Entretiempo | Descanso tras el 2.º cuarto (`HALFTIME`): sin jugadas ni tiempos muertos hasta comenzar el 3.er cuarto. |
