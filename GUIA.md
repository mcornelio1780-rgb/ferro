# Ferro · Guía para publicar la web (GitHub → Vercel → Polar → Firebase)

Ferro es una marca de **Limly LLC** (Delaware, EE. UU.).
Versión: 16 de noviembre de 2026. Idiomas de la web: español, inglés, portugués y francés.

---

## La idea: publicar primero, completar después

Este ZIP **ya funciona en línea tal como está**. No necesitas Polar ni Firebase para publicarlo:

| Parte | Sin configurar nada | Cuando completes `assets/config.js` |
|---|---|---|
| Landing, app y páginas legales en 4 idiomas | ✅ Funcionan | ✅ |
| Aviso amarillo de "modo prueba" | ❌ No existe | ❌ |
| App (modelos, memo, índice) | ✅ Abierta para todos, sin cuenta | Pide crear cuenta gratis (correo o Google) |
| Formulario de contacto y suscripción | ✅ Te llegan a **manyosa@limly.io** | Además se guardan en la base de datos |
| Botones de compra | Muestran **"Muy pronto"** y guardan el correo del interesado (te llega por correo) | Abren el checkout de Polar o Stripe |
| Botón "Ingresar" | Oculto (no hay cuentas aún) | Visible |

Así se rompe el círculo vicioso:

1. Publicas en Vercel y obtienes tu URL.
2. Con esa URL creas los Checkout Links en Polar.
3. Pegas los enlaces en `assets/config.js` **directamente en GitHub**.
4. Vercel vuelve a publicar solo, en un minuto.

**No necesitas un ZIP nuevo para eso.**

---

## Paso 1 · Subir a GitHub (5 min)

1. Descomprime `ferro-web.zip` en tu computadora. Debe quedar una carpeta `ferro-web` con `index.html` adentro.
2. Ve a github.com → **New repository**:
   - Nombre: `ferro-web`.
   - Visibilidad: **Private**.
   - No marques README ni .gitignore.
   - **Create repository**.
3. En la página del repositorio vacío, haz clic en **uploading an existing file**.
4. Arrastra **el contenido** de la carpeta `ferro-web`, no la carpeta misma. Tienen que aparecer `index.html`, `app.html`, `assets/`, etc. en la raíz.
5. Escribe `Primera versión de Ferro` en el mensaje y presiona **Commit changes**.

> El archivo `.gitignore` empieza con punto y en Mac queda oculto. Si no se sube, no pasa nada.

## Paso 2 · Publicar en Vercel (5 min)

1. vercel.com → **Sign up / Log in with GitHub**.
2. **Add New → Project** → elige `ferro-web` → **Import**.
3. Configuración:
   - **Framework Preset:** `Other`.
   - **Build Command:** vacío.
   - **Output Directory:** vacío (o `.`).
   - **Root Directory:** `./`.
4. Presiona **Deploy**. En menos de un minuto tendrás una URL como `https://ferro-web.vercel.app`.
5. Abre la URL y prueba: landing → cambiar idioma → **Abrir la app** → enviar un mensaje de contacto.

> ⚠️ **Sobre Vercel gratis.** El plan Hobby de Vercel es solo para uso personal y no comercial. Para vender, Vercel exige el plan Pro (US$20 al mes). La alternativa gratis que permite uso comercial es **Cloudflare Pages**: Workers & Pages → Create → Pages → Connect to Git → elige el repo → sin build → Deploy. El mismo ZIP funciona igual en los dos. Puedes empezar en Vercel y mudarte en 10 minutos.

## Paso 3 · Activar los avisos por correo (2 min)

1. Envía un mensaje de prueba desde el formulario de contacto de tu web publicada.
2. A **manyosa@limly.io** llegará un correo de **FormSubmit** que dice "Activate Form" o "Confirm your email". Ábrelo y confirma.
3. Desde ese momento, cada mensaje de contacto, suscripción y "avísame cuando abra la venta" te llega a ese correo.

Si no lo ves, revisa spam. Para cambiar el correo, edita `notifyEmail` en `assets/config.js`.

---

## Paso 4 · Polar: crear los Checkout Links con tu URL de Vercel

Ya tienes los productos creados. Ahora, en Polar → **Products → Checkout Links → New Link**:

| | Ferro Kit | Index Pro |
|---|---|---|
| Products | Ferro Kit | Ferro Index Pro |
| **Success URL** | `https://TU-URL.vercel.app/gracias.html?p=kit&checkout_id={CHECKOUT_ID}` | `https://TU-URL.vercel.app/gracias.html?p=pro&checkout_id={CHECKOUT_ID}` |
| **Return URL** | `https://TU-URL.vercel.app/index.html#precios` | igual |

Copia la URL de cada link (empieza con `https://buy.polar.sh/`). La guía completa de Polar está en `ferro-guia-polar-paso-a-paso.md`.

Para Review ($249) y Briefing ($2.000) usa **Stripe Payment Links**. Polar no permite vender servicios humanos.

## Paso 5 · Pegar los enlaces sin ZIP nuevo (2 min)

1. En GitHub, abre tu repo → carpeta `assets` → archivo `config.js` → ícono del lápiz ✏️.
2. Pega cada enlace entre las comillas:

   ```js
   polar: {
     kit: "https://buy.polar.sh/polar_cl_xxxxx",
     pro: "",
     review: "https://buy.stripe.com/xxxxx",
     briefing: "",
     portal: "https://polar.sh/TU-SLUG/portal"
   },
   ```

   Completa también `siteUrl: "https://TU-URL.vercel.app"`.
3. Presiona **Commit changes**. Vercel publica solo en aproximadamente 1 minuto.

Cuidado con las comillas y las comas: cada línea termina en coma, menos la última de cada bloque.

---

## Paso 6 · Firebase: cuentas y base de datos gratis (20–30 min)

Firebase (de Google) en el plan **Spark** es gratis, no pide tarjeta y permite uso comercial. Envía los correos de activación sin configurar nada extra y trae el login con Google. Revisa los límites vigentes en firebase.google.com/pricing.

### 6.1 Crear el proyecto

1. console.firebase.google.com → **Crear un proyecto**.
   - Nombre: `ferro`.
   - Google Analytics: **desactivado** (no hace falta).
2. En la pantalla del proyecto, haz clic en el ícono **`</>` (Web)**:
   - Apodo: `ferro-web`.
   - **No** marques Firebase Hosting.
   - **Registrar app**.
3. Firebase te muestra un bloque `const firebaseConfig = { apiKey: "...", authDomain: "...", ... }`. **Cópialo**: lo pegas en el paso 6.5.

> El `apiKey` de Firebase **no es secreto**: está hecho para ir en la web. La seguridad la dan las reglas del paso 6.4.

### 6.2 Activar el login

**Compilación (Build) → Authentication → Comenzar → Método de acceso (Sign-in method):**

1. **Correo electrónico/contraseña** → Habilitar → Guardar. Deja apagado "vínculo por correo".
2. **Google** → Habilitar:
   - Correo de asistencia: el tuyo.
   - Guardar.
3. **Configuración (Settings) → Dominios autorizados → Agregar dominio:**
   - Agrega `TU-URL.vercel.app`, sin `https://`.
   - Si luego usas un dominio propio o Cloudflare, agrégalo también.
4. **Plantillas (Templates):**
   - En "Verificación de dirección de correo", cambia el **nombre del remitente** a `Ferro`.
   - El idioma del correo se ajusta solo al idioma de la web.

### 6.3 Crear la base de datos

**Compilación → Firestore Database → Crear base de datos:**

- Ubicación: `nam5 (us-central)` o la más cercana a tus clientes. No se puede cambiar después.
- Modo: **producción**.
- **Crear**.

### 6.4 Pegar las reglas de seguridad (el paso "donde tengo que pegar")

1. Dentro de **Firestore Database**, arriba, abre la pestaña **Reglas (Rules)**.
2. **Borra todo** lo que hay en el editor.
3. Abre el archivo `firebase/firestore.rules` de este ZIP con cualquier editor de texto. Copia **todo** y pégalo.
4. Presiona **Publicar (Publish)**.

Estas reglas hacen que:

- Cualquiera pueda **enviar** un mensaje o suscribirse, pero **solo manyosa@limly.io** pueda **leerlos**.
- Cada usuario vea solo **sus** escenarios y su perfil.

Si cambias el correo de administrador, cámbialo en las reglas (`isAdmin`) y en `config.js` (`adminEmails`).

### 6.5 Conectar la web

En GitHub → `assets/config.js` → ✏️ → copia los valores de tu `firebaseConfig`:

```js
firebase: {
  apiKey: "AIza....",
  authDomain: "ferro-xxxx.firebaseapp.com",
  projectId: "ferro-xxxx",
  storageBucket: "ferro-xxxx.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
},
```

**Commit changes**. En un minuto la web muestra **Ingresar**, la app pide crear cuenta gratis y aparece **Mi cuenta**.

### 6.6 Probar

1. **Crear cuenta** con un correo nuevo → llega el correo de activación (revisa spam) → actívala → ingresa.
2. **Continuar con Google** → entra directo.
3. Ingresa con **manyosa@limly.io** (activado): aparecen las pestañas **Admin** y **Leads**.
4. Envía un mensaje de contacto → lo ves en **Admin**, en Firebase → Firestore → `contact_messages`, y en tu correo.

---

## Dónde se guardan los datos

| Qué | Sin Firebase | Con Firebase |
|---|---|---|
| Mensajes de contacto | Tu correo (FormSubmit) | Firestore `contact_messages` + tu correo |
| Suscriptores del índice | Tu correo | Firestore `subscribers` |
| "Avísame" de compras | Tu correo | Firestore `contact_messages` (tema `waitlist`) + tu correo |
| Usuarios | — | Firebase Authentication + Firestore `profiles` |
| Escenarios de la app | El navegador del usuario | Firestore `profiles/{usuario}/scenarios` |

Para verlo todo: entra a la app con tu correo → pestaña **Admin** → **Exportar CSV**.

---

## Alternativas gratis a Supabase

| Opción | Costo | ¿Este código la soporta? | Comentario |
|---|---|---|---|
| **Firebase (Spark)** | $0, uso comercial permitido | ✅ Sí (recomendada) | Correos de activación y Google listos sin configurar SMTP |
| **Supabase, pausando uno de tus 2 proyectos** | $0 | ✅ Sí (`supabaseUrl` + `supabase/schema.sql`) | Los proyectos pausados no cuentan para el límite. Los correos requieren SMTP propio (Brevo gratis) |
| **Solo correo (FormSubmit)** | $0 | ✅ Ya activo | Sin cuentas de usuario. Sirve para lanzar hoy |
| Appwrite Cloud, Nhost, PocketBase | Planes gratis con límites | ❌ No (requiere adaptar código) | Solo si Firebase no te sirve |

Crear otra cuenta de Supabase con otro correo para saltar el límite **no es recomendable**: puede ir contra sus términos.

---

## Datos que me puedes pasar (o pegarlos tú en `assets/config.js`)

```
URL de Vercel:     https://....vercel.app
firebaseConfig:    (el bloque completo)
polar.kit:         https://buy.polar.sh/...
polar.pro:         https://buy.polar.sh/...   (cuando lo actives)
polar.review:      https://buy.stripe.com/...
polar.portal:      https://polar.sh/.../portal
substack:          https://....substack.com
```

**Nunca pegues aquí** claves secretas: ni la "service_role" de Supabase, ni la "secret key" de Stripe, ni tokens de Polar.

---

## Contenido del ZIP

```
index.html          Landing (ES/EN/PT/FR)
app.html            App: modelos RaaS, GPU, DC, deal memo, índice, cuenta, admin
legal.html          Términos, privacidad, uso de IA y regulación, reembolsos, cookies
gracias.html        Página después de pagar
assets/config.js    ← ÚNICO archivo para editar
assets/ferro.js     Motor: idioma, cuentas, formularios, pagos
assets/vendor/      Firebase y Supabase (se cargan solo si los configuras)
firebase/firestore.rules   Reglas de seguridad para pegar en Firebase
supabase/schema.sql        Solo si usas Supabase en vez de Firebase
vercel.json, _headers      Encabezados de seguridad (Vercel / Cloudflare)
```
