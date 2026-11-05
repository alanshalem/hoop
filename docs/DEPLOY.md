# Publicar Hoop en internet (gratis)

Guía para dejar Hoop disponible online sin pagar, con **Vercel** (la app) y **Supabase** (la base PostgreSQL).

**Resumen:** subís el código a GitHub, creás una base en Supabase, importás el repositorio en Vercel con dos variables, cargás los datos desde tu PC y Vercel te da una dirección pública con HTTPS.

## Índice

1. [Cómo funciona Hoop en este hosting](#1-cómo-funciona-hoop-en-este-hosting)
2. [Cuentas y límites del plan gratuito](#2-cuentas-y-límites-del-plan-gratuito)
3. [Crear la base en Supabase](#3-crear-la-base-en-supabase)
4. [Publicar la app en Vercel](#4-publicar-la-app-en-vercel)
5. [Cargar los datos iniciales](#5-cargar-los-datos-iniciales)
6. [Comprobar que todo funciona](#6-comprobar-que-todo-funciona)
7. [Publicar cambios nuevos](#7-publicar-cambios-nuevos)
8. [Backups](#8-backups)
9. [Seguridad](#9-seguridad)
10. [Problemas comunes](#10-problemas-comunes)

## 1. Cómo funciona Hoop en este hosting

| Pieza | Dónde corre | Detalle |
| --- | --- | --- |
| App Next.js | Vercel (funciones serverless) | Cada pedido lo atiende una función que puede arrancar y apagarse sola. |
| Base PostgreSQL | Supabase | La app se conecta por el **pooler en modo transacción** (puerto `6543`), pensado para funciones serverless. |
| Sincronización entre tablets | Navegador | La pestaña que coordina consulta al servidor cada 10 segundos mientras alguna pestaña está a la vista, y en el momento al volver a la app, al recuperar internet y después de subir un cambio. No necesita conexiones abiertas permanentes. |
| HTTPS | Vercel | Automático. La cookie de sesión se marca `Secure` en producción. |

## 2. Cuentas y límites del plan gratuito

| Cuenta | Para qué | Límites a tener en cuenta |
| --- | --- | --- |
| **GitHub** (`alanshalem/hoop`) | Vercel toma el código del repositorio y publica cada cambio de `main`. | Ninguno relevante. |
| **Vercel**, plan Hobby ([vercel.com](https://vercel.com)) | Corre la app. | Es para uso personal y no comercial. Las funciones duran como máximo 300 segundos (Hoop usa pedidos cortos). |
| **Supabase**, plan Free ([supabase.com](https://supabase.com)) | Base PostgreSQL. | 500 MB de base. **Si el proyecto pasa 7 días con poca actividad, Supabase lo pausa**; se reactiva desde su panel con un clic (los datos se conservan). |

Los límites pueden cambiar: revisá las páginas de precios antes de empezar.

En tu PC necesitás **Node.js 20 o superior** y el repositorio clonado, para crear las tablas y cargar los datos (sección 5). Para importar actas también necesitás `pdftotext` (viene con Git for Windows o con Poppler).

## 3. Crear la base en Supabase

1. *New project*. Elegí una contraseña fuerte para la base (guardala) y una región cercana, por ejemplo **South America (São Paulo)**.
2. Cuando el proyecto esté listo: botón **Connect** (arriba del panel). Ahí vas a copiar dos direcciones:

   | Para qué | Cuál | Puerto |
   | --- | --- | --- |
   | La app en Vercel | **Transaction pooler** | `6543` |
   | Migraciones e importación desde tu PC | **Session pooler** | `5432` |

   Las dos tienen la forma `postgresql://postgres.<proyecto>:<contraseña>@aws-0-<región>.pooler.supabase.com:<puerto>/postgres`. Reemplazá `[YOUR-PASSWORD]` por la contraseña del paso 1.
3. **SSL:** agregá al final de cada dirección `?uselibpqcompat=true&sslmode=require`. Así la conexión va cifrada. Sin ese agregado, la versión de `pg` que usa Hoop exige verificar el certificado de Supabase contra los certificados públicos y la conexión falla. Si querés verificación estricta, descargá el certificado de Supabase (*Database Settings → SSL Configuration*) y usá `sslmode=verify-full&sslrootcert=<ruta>` desde tu PC.

No uses la dirección "Direct connection" (`db.<proyecto>.supabase.co`): en el plan gratuito solo funciona por IPv6.

## 4. Publicar la app en Vercel

1. **Subir el código.** `git push origin main`. Nunca subas `.env`, las actas PDF ni el CSV: `.env` ya está en `.gitignore`; las actas y el CSV no están versionados (no los agregues).
2. En Vercel: *Add New → Project* → importá `alanshalem/hoop`. Vercel detecta Next.js; no cambies los comandos de build.
3. **Variables de entorno** (antes del primer deploy):

   | Variable | Valor |
   | --- | --- |
   | `DATABASE_URL` | La dirección del **Transaction pooler** (puerto `6543`) con `?uselibpqcompat=true&sslmode=require`. |
   | `DATABASE_POOL_MAX` | Opcional. Conexiones por instancia; por defecto `3`. Con el plan gratuito de Supabase conviene dejarlo en `3` o bajarlo a `1` si ves errores de "too many clients". |

   No definas `SEED_DEMO_PASSWORD` ni `SESSION_COOKIE_SECURE` en Vercel: la primera solo se usa desde tu PC y la segunda tiene el valor correcto por defecto detrás de HTTPS. `NODE_ENV=production` lo pone Vercel solo.
4. **Región de las funciones** (*Settings → Functions → Function Region*): elegí la más cercana a la base, por ejemplo **São Paulo (gru1)** si Supabase está en São Paulo. Cada pedido hace varias consultas; tener app y base cerca lo hace mucho más rápido.
5. *Deploy*. Vercel te da una dirección como `https://hoop-xxxx.vercel.app`. Todavía no podés entrar: faltan las tablas y el usuario admin (sección 5).

## 5. Cargar los datos iniciales

Se hace **una sola vez, desde tu PC**, con la dirección del **Session pooler** (puerto `5432`).

En una terminal, dentro del repositorio (Git Bash):

```bash
# 1. Dirección del Session pooler (no la guardes en ningún archivo versionado)
export DATABASE_URL='postgresql://postgres.<proyecto>:<contraseña>@aws-0-<región>.pooler.supabase.com:5432/postgres?uselibpqcompat=true&sslmode=require'

# 2. Crear las tablas
npm run db:migrate

# 3. Crear el usuario admin@camg.com.ar con una contraseña FUERTE
#    (también carga datos de demostración, que el paso 5 borra)
SEED_DEMO_PASSWORD='una-contraseña-larga-y-única' npm run db:seed

# 4. Revisar qué se va a importar de las actas, sin escribir nada
npm run db:import-actas -- --csv planillas_monte_grande_lm_21_partidos.csv --pdfs . --dry-run

# 5. Reemplazar los datos de demostración por los de las actas
npm run db:import-actas -- --csv planillas_monte_grande_lm_21_partidos.csv --pdfs . --yes
```

Qué queda después del paso 5:

- Solo la cuenta **admin@camg.com.ar**, con la contraseña del paso 3. Las cuentas de demostración se borran.
- La división Primera, los jugadores, los rivales, los entrenadores y los 21 partidos de las actas.

`db:migrate` del paso 2 aplica todas las migraciones, también la `0006` (cuentas activas y cambio obligatorio de contraseña) y la `0007` (límite de intentos de contraseña).

**Las demás cuentas no se crean con el seed.** Después del primer ingreso, el admin las crea desde **Usuarios** (en el menú lateral), cada una con una contraseña temporal (el botón **Generar** arma una). Pasásela a cada persona por un medio privado: al entrar por primera vez, Hoop la obliga a elegir una propia.

Si `pdftotext` no está en el PATH, indicalo con `PDFTOTEXT=/ruta/a/pdftotext` (en Git for Windows suele estar en `/ucrt64/bin/pdftotext`).

## 6. Comprobar que todo funciona

- [ ] La dirección de Vercel abre la pantalla de **Ingresar** con candado HTTPS.
- [ ] Entrás con `admin@camg.com.ar` y la contraseña del paso 3 de la sección 5.
- [ ] **Usuarios** lista la cuenta del admin. Creás una cuenta de prueba, entrás con ella en otro navegador y Hoop te pide cambiar la contraseña temporal. Después la desactivás.
- [ ] **Partidos** muestra los 21 partidos con "Resultado oficial (acta)".
- [ ] **Jugadores**, **Rivales** y **Entrenadores** muestran los datos importados.
- [ ] Abrís la app en dos dispositivos, creás un partido de prueba en uno y aparece en el otro en unos 10 segundos. Después lo borrás.
- [ ] El indicador de sincronización dice **Sincronizado**.

## 7. Publicar cambios nuevos

1. Hacés los cambios en tu PC, con los tests en verde (`npm test`).
2. **Si el cambio agrega una migración** (archivos nuevos en `drizzle/`), corré `npm run db:migrate` contra Supabase **antes** del push, con `DATABASE_URL` apuntando al Session pooler (como en la sección 5). Las migraciones de Hoop solo agregan; nunca borran datos.

   **La versión con Usuarios trae la migración `0006_black_serpent_society.sql`.** Agrega a `users` las columnas `active` (por defecto `true`) y `must_change_password` (por defecto `false`): las cuentas existentes siguen activas y con su contraseña. Aplicala con `npm run db:migrate` contra el Session pooler **antes** de pushear: la versión nueva lee esas columnas en cada inicio de sesión y, sin ellas, nadie puede entrar. Desde esta versión las cuentas nuevas se crean desde **Usuarios**, no con `db:seed`.

   **La versión con límite de intentos trae la migración `0007_wide_adam_destine.sql`.** Crea la tabla `auth_throttles`, donde se cuentan las contraseñas incorrectas (no toca datos existentes). Aplicala con `npm run db:migrate` contra el Session pooler **antes** de pushear: la versión nueva usa esa tabla en cada inicio de sesión y, sin ella, nadie puede entrar. Si todavía no aplicaste la `0006`, el mismo `npm run db:migrate` aplica las dos, en orden.
3. `git push origin main`: Vercel construye y publica la nueva versión sola. Cada rama o PR también recibe una dirección de vista previa.
4. **No** vuelvas a correr `db:seed` ni `db:import-actas --yes` en producción salvo que quieras reemplazar todos los datos: `db:import-actas --yes` borra todo excepto el admin.

## 8. Backups

El plan gratuito de Supabase no incluye backups descargables. Sacá uno manual desde tu PC antes de cualquier operación grande (y de vez en cuando):

```bash
pg_dump "$DATABASE_URL" > hoop-backup-$(date +%Y%m%d).sql
```

Usá la dirección del Session pooler. Guardá el archivo **fuera del repositorio** (tiene datos personales).

## 9. Seguridad

- **Contraseña del admin:** usá una larga y única. Se define al correr `db:seed` (la importación de actas no la cambia) y después se cambia desde **Cambiar contraseña** en el menú de usuario.
- **Datos personales:** las actas y el CSV tienen nombres y licencias reales. No los subas a GitHub ni a ningún servicio público; la importación los lee solo desde tu PC.
- **Variables secretas:** `DATABASE_URL` vive solo en las variables de Vercel y en tu terminal, nunca en archivos versionados.
- **Supabase:** Hoop no usa la API de Supabase ni sus claves `anon`/`service_role`; solo la conexión PostgreSQL. No publiques esas claves.
- **Usuarios:** después de importar solo existe el admin. Los entrenadores son fichas sin login; si otra persona necesita entrar, el admin le crea una cuenta desde **Usuarios** con una contraseña temporal. Si alguien deja el club, desactivá su cuenta (no se borra y sus sesiones se cierran al instante); si olvida la contraseña, usá **Restablecer contraseña**.
- **Intentos de contraseña:** tras 5 inicios de sesión fallidos con el mismo correo, o 20 desde la misma IP, en 15 minutos, Hoop rechaza los intentos durante 15 minutos ("Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo."); lo mismo tras 5 contraseñas actuales incorrectas al cambiarla. La IP sale del encabezado `X-Forwarded-For` que fija Vercel, así que todas las tablets del club que salen por la misma conexión comparten el límite de 20. Para desbloquear una cuenta antes, el admin le restablece la contraseña desde **Usuarios**.

## 10. Problemas comunes

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| `self-signed certificate in certificate chain` | Falta el agregado SSL en la dirección | Terminá la dirección con `?uselibpqcompat=true&sslmode=require` (sección 3). |
| `ENETUNREACH` o la conexión no responde | Se usó la "Direct connection" (solo IPv6) | Usá el Transaction pooler en Vercel y el Session pooler en tu PC. |
| "Error al sincronizar" en todas las pantallas | Faltan migraciones o el proyecto de Supabase está pausado | Corré `npm run db:migrate` (sección 5) o reactivá el proyecto desde el panel de Supabase. |
| `too many clients` / `max client connections` | Demasiadas conexiones para el plan gratuito | Bajá `DATABASE_POOL_MAX` a `1` en Vercel y volvé a publicar. |
| No se puede iniciar sesión, sin mensaje de error | Se entró por `http://` | Entrá siempre por la dirección `https://` de Vercel. |
| La app tarda mucho en cada pantalla | Función de Vercel lejos de la base | Elegí la región de funciones más cercana a Supabase (sección 4). |
| Nadie puede iniciar sesión después de publicar, o `column "active" does not exist` en los logs de Vercel | Falta la migración `0006` en Supabase | Corré `npm run db:migrate` con el Session pooler (sección 7). |
| Nadie puede iniciar sesión después de publicar, o `relation "auth_throttles" does not exist` en los logs de Vercel | Falta la migración `0007` en Supabase | Corré `npm run db:migrate` con el Session pooler (sección 7). |
| "Demasiados intentos" al iniciar sesión | 5 contraseñas incorrectas para ese correo, o 20 desde la misma conexión, en 15 minutos | Esperá 15 minutos, o restablecé la contraseña de la cuenta desde **Usuarios** (levanta el bloqueo del correo, no el de la conexión). |
| Una tablet perdió cambios sin sincronizar y mostró un aviso | Se reemplazaron los datos (importación) y su copia local era de la versión anterior | Es el comportamiento esperado: la tablet descarta la copia vieja y descarga la nueva. |
