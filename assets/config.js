/* =====================================================================
   FERRO · CONFIGURACIÓN ÚNICA  (Ferro es una marca de Limly LLC)
   Este es el ÚNICO archivo que hay que editar. Se puede editar directo en
   GitHub (lápiz ✏️ → Commit) y Vercel vuelve a publicar solo en ~1 minuto.

   Así como está, la web YA funciona en línea:
   - La landing, la app y las páginas legales cargan en ES / EN / PT / FR.
   - La app se usa sin crear cuenta (no aparece ningún aviso de "modo prueba").
   - Contacto y suscripciones te llegan por correo a notifyEmail.
   - Los botones de compra muestran "Muy pronto" y guardan el interesado
     hasta que pegues los enlaces de pago.
   ===================================================================== */
window.FERRO_CONFIG = {
  // Dirección pública final, sin barra al final. Ej.: "https://ferro.vercel.app"
  // Puede quedar vacío: la web la detecta sola.
  siteUrl: "",

  // Correo público de contacto (aparece en la web)
  email: "manyosa@limly.io",

  // Correo que recibe cada mensaje de contacto, suscripción y lista de espera.
  // Usa FormSubmit (gratis). La PRIMERA vez llega un correo "Confirm your email": ábrelo y confirma.
  notifyEmail: "manyosa@limly.io",

  // ---------- Cuentas y base de datos ----------
  // Opción recomendada: Firebase (gratis, plan Spark). Pega aquí lo que da
  // Firebase → Configuración del proyecto → Tus apps → Web → "firebaseConfig".
  // Mientras apiKey esté vacío, no hay login y la app queda abierta para todos.
  firebase: {
    apiKey: "",
    authDomain: "",       // ej. "ferro-xxxx.firebaseapp.com"
    projectId: "",        // ej. "ferro-xxxx"
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },

  // Opción alternativa: Supabase (solo si NO usas Firebase).
  supabaseUrl: "",
  supabaseAnonKey: "",

  // true = con base de datos configurada, la app pide crear cuenta (gratis)
  requireLogin: true,
  // Mostrar "Continuar con Google"
  googleLogin: true,
  // Correos que ven la pestaña Admin (debe coincidir con firestore.rules)
  adminEmails: ["manyosa@limly.io"],

  // ---------- Pagos ----------
  // Vacío = el botón muestra "Muy pronto" y guarda el correo del interesado.
  // kit y pro → Polar → Products → Checkout Links (https://buy.polar.sh/...)
  // review y briefing → Stripe Payment Link o PayPal (Polar no permite servicios humanos)
  polar: {
    kit: "",        // Polar · Ferro Kit · $59
    pro: "",        // Polar · Index Pro · $99/mes
    review: "",     // Stripe/PayPal · Ferro Review · $249
    briefing: "",   // Stripe/PayPal · Briefing · $2.000
    portal: ""      // https://polar.sh/TU-ORGANIZACION/portal
  },

  // Newsletter (Substack). Ej.: "https://ferroindex.substack.com"
  substack: "",

  legal: {
    company: "Limly LLC",
    brand: "Ferro",
    state: "Delaware, EE. UU.",
    address: "8 The Green, Suite B, Dover, DE 19901, EE. UU.",
    updated: "2026-11-16"
  }
};
