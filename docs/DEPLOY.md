# Publicar Hoop en internet

Guía para dejar Hoop disponible online, con su base de datos, para usarlo desde cualquier tablet o celular.

**Resumen:** subís el código a GitHub, creás un proyecto en **Railway** con la app y una base **PostgreSQL**, configurás dos variables, cargás los datos desde tu PC y Railway te da una dirección pública con HTTPS.

## Índice

1. [Qué necesita Hoop para funcionar](#1-qué-necesita-hoop-para-funcionar)
2. [Cuentas y servicios](#2-cuentas-y-servicios)
3. [Paso a paso con Railway](#3-paso-a-paso-con-railway)
4. [Cargar los datos iniciales](#4-cargar-los-datos-iniciales)
5. [Dominio propio (opcional)](#5-dominio-propio-opcional)
6. [Comprobar que todo funciona](#6-comprobar-que-todo-funciona)
7. [Publicar cambios nuevos](#7-publicar-cambios-nuevos)
8. [Backups](#8-backups)
9. [Seguridad](#9-seguridad)
10. [Alternativa: Render](#10-alternativa-render)
11. [Problemas comunes](#11-problemas-comunes)

## 1. Qué necesita Hoop para funcionar

| Pieza | Qué es | Por qué importa |
| --- | --- | --- |
| Servidor Node.js siempre encendido | La app Next.js (`npm run build` y `npm run start`) | La sincronización en vivo entre tablets usa una conexión abierta (Server-Sent Events) y escucha la base con `LISTEN/NOTIFY`. Eso necesita un proceso que no se apague entre pedidos. |
| PostgreSQL 17 (o 15+) | La base de datos | Guarda usuarios, sesiones, partidos y jugadas. |
| HTTPS | Conexión cifrada | La cookie de sesión se marca `Secure` en producción: sin HTTPS no se puede iniciar sesión. |

**Por qué no Vercel (u otro "serverless"):** esas plataformas cortan las conexiones largas y no mantienen un proceso escuchando la base, así que la actualización en vivo entre tablets dejaría de funcionar. Por la misma razón, si usás una base externa con "pooler" (por ejemplo, Neon o Supabase en modo pooler), usá la URL de **conexión directa**: `LISTEN` no funciona a través de un pooler en modo transacción.

## 2. Cuentas y servicios

| Cuenta | Para qué | Costo |
| --- | --- | --- |
| **GitHub** (ya la tenés: `alanshalem/hoop`) | Railway toma el código del repositorio y publica cada cambio de `main`. | Gratis |
| **Railway** ([railway.com](https://railway.com)) | Corre la app y la base PostgreSQL. | Plan pago de uso bajo; para un club alcanza el plan más chico. Consultá el precio actual en su página antes de empezar. |
| **Dominio propio** (opcional, por ejemplo en NIC Argentina para `.com.ar`, o Cloudflare) | Una dirección como `hoop.camg.com.ar`. | Pago anual del dominio. Sin dominio, Railway te da una dirección gratuita `*.up.railway.app`. |

En tu PC necesitás **Node.js 20 o superior** y el repositorio clonado, para cargar los datos (sección 4). Para importar actas también necesitás `pdftotext` (viene con Git for Windows o con Poppler).

## 3. Paso a paso con Railway

> Los nombres de menús de Railway pueden cambiar con el tiempo; la idea de cada paso se mantiene.

1. **Subir el código.** Asegurate de que `main` esté en GitHub (`git push origin main`). Nunca subas `.env`, las actas PDF ni el CSV: `.env` ya está en `.gitignore`; las actas y el CSV no están versionados (no los agregues).
2. **Crear el proyecto.** En Railway: *New Project* → *Deploy from GitHub repo* → elegí `alanshalem/hoop`.
3. **Agregar la base.** En el mismo proyecto: *New* → *Database* → *PostgreSQL*.
4. **Variables de la app.** En el servicio de la app → *Variables*:

   | Variable | Valor |
   | --- | --- |
   | `DATABASE_URL` | La URL de la base del proyecto (Railway permite referenciarla, por ejemplo `${{Postgres.DATABASE_URL}}`). |
   | `NODE_ENV` | `production` |

   No hace falta `SEED_DEMO_PASSWORD` en el servidor: solo se usa al cargar datos desde tu PC. Tampoco definas `SESSION_COOKIE_SECURE`: detrás de HTTPS el valor por defecto (cookie `Secure` en producción) es el correcto; `false` solo sirve para una red local de confianza sin HTTPS.
5. **Comandos.** Build: `npm run build`. Start: `npm run start`. Next.js toma el puerto de la variable `PORT` que pone Railway.
6. **Dirección pública.** En el servicio de la app → *Settings* → *Networking* → *Generate Domain*. Queda algo como `https://hoop-production.up.railway.app`.
7. **Primer deploy.** Railway construye y arranca la app. Todavía no podés entrar: falta crear las tablas y el usuario admin (sección 4).

## 4. Cargar los datos iniciales

Se hace **una sola vez, desde tu PC**, apuntando a la base de Railway. Necesitás la **URL pública** de la base (en el servicio PostgreSQL → *Connect* / *Variables*, la que sirve para conectarse desde fuera de Railway).

En una terminal, dentro del repositorio (Git Bash):

```bash
# 1. URL pública de la base de Railway (no la guardes en ningún archivo versionado)
export DATABASE_URL='postgresql://...'

# 2. Crear las tablas
npm run db:migrate

# 3. Crear el usuario admin@camg.com.ar con una contraseña FUERTE
#    (también carga datos de demostración, que el paso 4 borra)
SEED_DEMO_PASSWORD='una-contraseña-larga-y-única' npm run db:seed

# 4. Revisar qué se va a importar de las actas, sin escribir nada
npm run db:import-actas -- --csv planillas_monte_grande_lm_21_partidos.csv --pdfs . --dry-run

# 5. Reemplazar los datos de demostración por los de las actas
npm run db:import-actas -- --csv planillas_monte_grande_lm_21_partidos.csv --pdfs . --yes
```

Qué queda después del paso 5:

- Solo la cuenta **admin@camg.com.ar**, con la contraseña que pusiste en el paso 3. Las cuentas de demostración se borran.
- La división Primera, los jugadores, los rivales, los entrenadores y los 21 partidos de las actas.

Si `pdftotext` no está en el PATH, indicalo con `PDFTOTEXT=/ruta/a/pdftotext` (en Git for Windows suele estar en `/ucrt64/bin/pdftotext`).

## 5. Dominio propio (opcional)

1. Comprá el dominio (o usá un subdominio del club, por ejemplo `hoop.camg.com.ar`).
2. En Railway: servicio de la app → *Settings* → *Networking* → *Custom Domain* → escribí el dominio.
3. Railway te muestra un registro DNS (normalmente un `CNAME`). Cargalo en el panel de quien administra el dominio.
4. Esperá a que el DNS se propague (de minutos a algunas horas). Railway emite el certificado HTTPS solo.

## 6. Comprobar que todo funciona

- [ ] La dirección pública abre la pantalla de **Ingresar** con candado HTTPS.
- [ ] Entrás con `admin@camg.com.ar` y la contraseña del paso 3 de la sección 4.
- [ ] **Partidos** muestra los 21 partidos con "Resultado oficial (acta)".
- [ ] **Jugadores**, **Rivales** y **Entrenadores** muestran los datos importados.
- [ ] Abrís la app en dos dispositivos, creás un partido de prueba en uno y aparece en el otro sin recargar (sincronización en vivo). Después lo borrás.
- [ ] El indicador de sincronización dice **Sincronizado**.

## 7. Publicar cambios nuevos

1. Hacés los cambios en tu PC, con los tests en verde (`npm test`).
2. `git push origin main`: Railway construye y publica la nueva versión sola.
3. **Si el cambio agrega una migración** (archivos nuevos en `drizzle/`), corré `npm run db:migrate` contra la base de producción **antes** del push (con `DATABASE_URL` apuntando a la URL pública, como en la sección 4). Las migraciones de Hoop solo agregan; nunca borran datos.
4. **No** vuelvas a correr `db:seed` ni `db:import-actas --yes` en producción salvo que quieras reemplazar todos los datos: `db:import-actas --yes` borra todo excepto el admin.

## 8. Backups

- Activá los backups automáticos de la base en Railway si tu plan los incluye.
- Además, antes de cualquier operación grande, sacá un backup manual desde tu PC:

  ```bash
  pg_dump "$DATABASE_URL" > hoop-backup-$(date +%Y%m%d).sql
  ```

  Guardalo **fuera del repositorio** (tiene datos personales).

## 9. Seguridad

- **Contraseña del admin:** usá una larga y única. Hoy no hay pantalla para cambiarla; se define al correr `db:seed` (la importación de actas no la cambia).
- **Datos personales:** las actas y el CSV tienen nombres y licencias reales. No los subas a GitHub ni a ningún servicio público; la importación los lee solo desde tu PC.
- **Variables secretas:** `DATABASE_URL` vive solo en las variables de Railway y en tu terminal, nunca en archivos versionados.
- **Usuarios:** después de importar solo existe el admin. Los entrenadores son fichas sin login; si más adelante otra persona necesita entrar, hay que crearle una cuenta (hoy no hay pantalla para eso).

## 10. Alternativa: Render

[Render](https://render.com) sirve igual, con dos servicios:

1. *New* → *PostgreSQL* (plan pago: el gratuito vence a los pocos días).
2. *New* → *Web Service* → el repositorio → Build `npm ci && npm run build`, Start `npm run start`, variables `DATABASE_URL` (la *Internal Database URL*) y `NODE_ENV=production`. Usá un plan pago: el gratuito se "duerme" sin uso y corta la sincronización en vivo.
3. La carga de datos es igual a la sección 4, con la *External Database URL*.

## 11. Problemas comunes

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| No se puede iniciar sesión, sin mensaje de error | La app no está en HTTPS o `NODE_ENV` no es `production` en un dominio sin HTTPS | Entrá siempre por la dirección `https://`; revisá las variables. |
| "Error al sincronizar" en todas las pantallas | Faltan migraciones | Corré `npm run db:migrate` contra la base de producción (sección 4). |
| `db:migrate` o `db:seed` fallan con un error de SSL | La base exige SSL desde fuera de Railway | Agregá `?sslmode=require` al final de la URL pública; si el certificado no valida, consultá la guía de conexión de tu proveedor. |
| Los cambios de una tablet no aparecen en la otra hasta recargar | La conexión en vivo está bloqueada o la base pasa por un pooler | Usá un hosting con proceso permanente (sección 1) y la URL directa de la base. |
| Después de publicar, una tablet perdió cambios sin sincronizar y mostró un aviso | Se reemplazaron los datos (importación) y su copia local era de la versión anterior | Es el comportamiento esperado: la tablet descarta la copia vieja y descarga la nueva. |
