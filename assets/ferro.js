/* Ferro shared runtime: idioma, cuentas (Firebase o Supabase), formularios y checkout.
   Ferro es una marca de Limly LLC.
   Sin base de datos configurada la web funciona igual: la app queda abierta sin cuenta,
   los formularios llegan por correo (FormSubmit) y los botones de compra muestran "Muy pronto". */
(function () {
  "use strict";
  var C = window.FERRO_CONFIG || {};
  C.polar = C.polar || {};
  C.legal = C.legal || {};
  C.firebase = C.firebase || {};
  var LANGS = ["es", "en", "pt", "fr"];
  var LOC = { es: "es-ES", en: "en-US", pt: "pt-BR", fr: "fr-FR" };

  /* ---------- storage seguro ---------- */
  var mem = {};
  function sget(k) { try { var v = localStorage.getItem(k); return v === null ? mem[k] || null : v; } catch (e) { return mem[k] || null; } }
  function sset(k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch (e) {} }

  /* ---------- idioma compartido ---------- */
  (function () { var q = new URLSearchParams(location.search).get("lang"); if (q && LANGS.indexOf(q) > -1) sset("ferro_lang", q); })();
  function getLang() {
    var s = sget("ferro_lang");
    if (s) { s = s.replace(/"/g, ""); if (LANGS.indexOf(s) > -1) return s; }
    var n = (navigator.language || "es").slice(0, 2).toLowerCase();
    return LANGS.indexOf(n) > -1 ? n : "en";
  }
  function setLang(l) {
    if (LANGS.indexOf(l) < 0) l = "es";
    sset("ferro_lang", l);
    document.documentElement.lang = l;
    if (B && B.setLang) B.setLang(l);
    window.dispatchEvent(new CustomEvent("ferro:lang", { detail: l }));
    if (modal && modal.open) paintModal();
  }

  /* ---------- rutas ---------- */
  function base() {
    if (C.siteUrl) return C.siteUrl.replace(/\/$/, "");
    var p = location.pathname.replace(/[^/]*$/, "");
    return location.origin + p.replace(/\/$/, "");
  }
  function appUrl() { return base() + "/app.html?lang=" + getLang(); }
  function assetUrl(f) {
    var me = document.querySelector('script[src*="ferro.js"]');
    var dir = me ? me.src.replace(/ferro\.js.*$/, "") : "assets/";
    return dir + f;
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = src; s.async = false;
      s.onload = res; s.onerror = function () { rej(new Error("No se pudo cargar " + src)); };
      document.head.appendChild(s);
    });
  }

  /* ---------- backend ---------- */
  var backend = "";
  if (C.firebase.apiKey && C.firebase.projectId && C.firebase.authDomain) backend = "firebase";
  else if (C.supabaseUrl && C.supabaseAnonKey) backend = "supabase";
  if (location.protocol === "file:") backend = "";
  var configured = !!backend;

  var currentUser = null;
  var listeners = [];
  var B = null; // adaptador activo
  function emit(evt) { listeners.forEach(function (f) { try { f(currentUser, evt); } catch (e) { console.error(e); } }); }

  var ready = configured ? (backend === "firebase" ? initFirebase() : initSupabase()).catch(function (e) {
    console.error("Ferro backend", e); configured = false; B = null; window.Ferro.configured = false; return null;
  }) : Promise.resolve(null);

  /* ===== Adaptador Firebase (Auth + Firestore) ===== */
  function initFirebase() {
    return loadScript(assetUrl("vendor/firebase-app-compat.js"))
      .then(function () { return loadScript(assetUrl("vendor/firebase-auth-compat.js")); })
      .then(function () { return loadScript(assetUrl("vendor/firebase-firestore-compat.js")); })
      .then(function () {
        var fb = window.firebase;
        var app = fb.apps && fb.apps.length ? fb.app() : fb.initializeApp(C.firebase);
        var auth = app.auth(), db = app.firestore();
        auth.languageCode = getLang();
        var TS = function () { return fb.firestore.FieldValue.serverTimestamp(); };
        var acs = function () { return { url: appUrl(), handleCodeInApp: false }; };
        function norm(u) {
          if (!u) return null;
          return { id: u.uid, email: u.email, verified: !!u.emailVerified, user_metadata: { full_name: u.displayName || "" }, provider: (u.providerData[0] || {}).providerId || "password" };
        }
        function verifiedOK(u) { return !!u && (u.emailVerified || (u.providerData || []).some(function (p) { return p.providerId === "google.com"; })); }
        var first = true, resolveReady;
        var readyP = new Promise(function (r) { resolveReady = r; });
        auth.onAuthStateChanged(function (u) {
          // una cuenta con correo sin activar no queda dentro
          if (u && !verifiedOK(u)) { currentUser = null; if (!B._signingUp) auth.signOut(); }
          else currentUser = norm(u);
          if (currentUser) touchProfile(u);
          if (first) { first = false; resolveReady(); }
          emit(currentUser ? "SIGNED_IN" : "SIGNED_OUT");
        });
        function touchProfile(u) {
          var ref = db.collection("profiles").doc(u.uid);
          ref.get().then(function (d) {
            var row = { email: (u.email || "").toLowerCase(), last_login: TS(), lang: getLang() };
            if (!d.exists) { row.created_at = TS(); row.full_name = u.displayName || ""; }
            return ref.set(row, { merge: true });
          }).catch(function (e) { console.warn("profile", e); });
        }
        function tsToIso(v) { return v && v.toDate ? v.toDate().toISOString() : v; }
        function fix(o) { var r = {}; Object.keys(o).forEach(function (k) { r[k] = tsToIso(o[k]); }); return r; }
        B = {
          name: "firebase",
          setLang: function (l) { auth.languageCode = l; },
          ready: readyP,
          signIn: function (email, pw) {
            return auth.signInWithEmailAndPassword(email, pw).then(function (cred) {
              if (!verifiedOK(cred.user)) { return auth.signOut().then(function () { var e = new Error("not verified"); e.code = "ferro/not-verified"; throw e; }); }
            });
          },
          signUp: function (email, pw, meta) {
            B._signingUp = true;
            return auth.createUserWithEmailAndPassword(email, pw).then(function (cred) {
              var u = cred.user;
              return u.updateProfile({ displayName: meta.full_name || "" })
                .then(function () { return db.collection("profiles").doc(u.uid).set({ email: email.toLowerCase(), full_name: meta.full_name || "", lang: getLang(), marketing_opt_in: !!meta.marketing_opt_in, terms_accepted_at: meta.terms_accepted_at, created_at: TS() }, { merge: true }).catch(function () {}); })
                .then(function () { return u.sendEmailVerification(acs()); })
                .then(function () { return auth.signOut(); })
                .then(function () { B._signingUp = false; return { needsConfirm: true }; });
            }, function (e) { B._signingUp = false; throw e; });
          },
          resend: function (email, pw) {
            if (!pw) return Promise.reject(new Error("password"));
            return auth.signInWithEmailAndPassword(email, pw).then(function (cred) {
              B._signingUp = true;
              return cred.user.sendEmailVerification(acs()).then(function () { return auth.signOut(); }).then(function () { B._signingUp = false; });
            });
          },
          google: function () {
            var p = new fb.auth.GoogleAuthProvider();
            p.setCustomParameters({ prompt: "select_account" });
            return auth.signInWithPopup(p).catch(function (e) {
              if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) return auth.signInWithRedirect(p);
              if (e && (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request")) return null;
              throw e;
            });
          },
          reset: function (email) { return auth.sendPasswordResetEmail(email, acs()).catch(function (e) { if (e && e.code === "auth/user-not-found") return; throw e; }); },
          updatePassword: null, // Firebase cambia la contraseña en su propia página segura
          signOut: function () { return auth.signOut(); },
          insert: function (col, row) { row.created_at = TS(); return db.collection(col).add(row); },
          getProfile: function (uid) { return db.collection("profiles").doc(uid).get().then(function (d) { return d.exists ? fix(d.data()) : null; }); },
          saveProfile: function (uid, row) { return db.collection("profiles").doc(uid).set(row, { merge: true }); },
          saveScenario: function (uid, model, inputs) { return db.collection("profiles").doc(uid).collection("scenarios").doc(model).set({ inputs: inputs, updated_at: TS() }); },
          loadScenarios: function (uid) { return db.collection("profiles").doc(uid).collection("scenarios").get().then(function (q) { var o = {}; q.forEach(function (d) { o[d.id] = d.data().inputs; }); return o; }); },
          adminList: function (col) {
            return db.collection(col).orderBy("created_at", "desc").limit(1000).get().then(function (q) {
              var a = []; q.forEach(function (d) { a.push(fix(d.data())); }); return a;
            });
          }
        };
        return readyP;
      });
  }

  /* ===== Adaptador Supabase (alternativa) ===== */
  function initSupabase() {
    return loadScript(assetUrl("vendor/supabase.js")).then(function () {
      var sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" } });
      var resolveReady, readyP = new Promise(function (r) { resolveReady = r; });
      function norm(u) { return u ? { id: u.id, email: u.email, verified: true, user_metadata: u.user_metadata || {} } : null; }
      sb.auth.onAuthStateChange(function (event, session) {
        currentUser = norm(session ? session.user : null);
        if (event === "PASSWORD_RECOVERY") openAuth("newpass");
        emit(event);
      });
      sb.auth.getSession().then(function (r) { currentUser = norm(r.data && r.data.session ? r.data.session.user : null); resolveReady(); }, resolveReady);
      function chk(r) { if (r && r.error) throw r.error; return r ? r.data : null; }
      B = {
        name: "supabase", ready: readyP,
        signIn: function (email, pw) { return sb.auth.signInWithPassword({ email: email, password: pw }).then(chk); },
        signUp: function (email, pw, meta) {
          return sb.auth.signUp({ email: email, password: pw, options: { emailRedirectTo: appUrl(), data: meta } }).then(function (r) {
            if (r.error) throw r.error;
            if (r.data && r.data.user && r.data.user.identities && r.data.user.identities.length === 0) { var e = new Error("already registered"); throw e; }
            return { needsConfirm: !(r.data && r.data.session) };
          });
        },
        resend: function (email) { return sb.auth.resend({ type: "signup", email: email, options: { emailRedirectTo: appUrl() } }).then(chk); },
        google: function () { return sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: appUrl() } }).then(chk); },
        reset: function (email) { return sb.auth.resetPasswordForEmail(email, { redirectTo: appUrl() }).then(function (r) { if (r.error && /rate|too many|security/i.test(r.error.message || "")) throw r.error; }); },
        updatePassword: function (pw) { return sb.auth.updateUser({ password: pw }).then(chk); },
        signOut: function () { return sb.auth.signOut(); },
        insert: function (tb, row) { return sb.from(tb).insert(row).then(function (r) { if (r.error && r.error.code !== "23505") throw r.error; }); },
        getProfile: function (uid) { return sb.from("profiles").select("full_name,company,role,country,marketing_opt_in").eq("id", uid).maybeSingle().then(chk); },
        saveProfile: function (uid, row) { return sb.from("profiles").upsert(Object.assign({ id: uid }, row)).then(chk); },
        saveScenario: function (uid, model, inputs) { return sb.from("scenarios").upsert({ user_id: uid, model: model, name: "default", inputs: inputs, updated_at: new Date().toISOString() }, { onConflict: "user_id,model,name" }).then(chk); },
        loadScenarios: function () { return sb.from("scenarios").select("model,inputs").eq("name", "default").then(function (r) { var o = {}; (chk(r) || []).forEach(function (x) { o[x.model] = x.inputs; }); return o; }); },
        adminList: function (tb) { return sb.from(tb).select("*").order("created_at", { ascending: false }).limit(1000).then(chk); }
      };
      return readyP;
    });
  }

  function getUser() { return ready.then(function () { return B && B.ready ? B.ready : null; }).then(function () { return currentUser; }); }
  function onAuth(f) { listeners.push(f); }
  function signOut() { if (!B) return Promise.resolve(); return Promise.resolve(B.signOut()).then(function () { currentUser = null; emit("SIGNED_OUT"); }); }
  function isAdmin(u) {
    u = u || currentUser; if (!u || !u.email) return false;
    return (C.adminEmails || []).map(function (x) { return String(x).toLowerCase(); }).indexOf(u.email.toLowerCase()) > -1;
  }

  /* ---------- textos del módulo de cuentas ---------- */
  var A = {
    es: { soonT: "Muy pronto", soonP: "Las compras de {p} abren en los próximos días. Déjanos tu correo y te avisamos primero.", soonBtn: "Avísame", soonOk: "Listo. Te escribiremos a {e} apenas abra.", mailUs: "O escríbenos a {m}", eDomain: "Este dominio aún no está autorizado para iniciar sesión.", login: "Ingresar", signup: "Crear cuenta", google: "Continuar con Google", or: "o con tu correo", name: "Nombre y apellido", email: "Correo", password: "Contraseña", pwHint: "Mínimo 8 caracteres", newpw: "Nueva contraseña", forgot: "¿Olvidaste tu contraseña?", sendReset: "Enviar enlace", back: "Volver a ingresar", save: "Guardar contraseña", terms: "Acepto los {t} y la {p}.", termsT: "Términos", termsP: "Política de privacidad", optin: "Quiero recibir el índice Ferro cada lunes.", haveAcc: "¿Ya tienes cuenta?", noAcc: "¿No tienes cuenta?", resetTitle: "Recuperar contraseña", newTitle: "Elige una nueva contraseña", close: "Cerrar",
      checkEmail: "Listo. Te enviamos un correo a {e} para activar tu cuenta. Si no llega en 5 minutos, revisa spam o promociones.", resetSent: "Si existe una cuenta con {e}, te llegará un enlace para cambiar la contraseña.", pwSaved: "Contraseña actualizada. Ya puedes usar la app.", resend: "Reenviar correo de activación", resent: "Correo reenviado.",
      eInvalid: "Correo o contraseña incorrectos.", eConfirm: "Tu cuenta aún no está activada. Revisa tu correo.", eExists: "Ya existe una cuenta con ese correo. Ingresa o recupera tu contraseña.", eRate: "Demasiados intentos por ahora. Espera unos minutos o usa Google.", eWeak: "La contraseña debe tener al menos 8 caracteres.", eTerms: "Debes aceptar los términos y la política de privacidad.", eEmail: "Escribe un correo válido.", eGeneric: "No pudimos completar la acción. Inténtalo de nuevo.", eNet: "Sin conexión con el servidor. Revisa tu internet.", demo: "Modo demo: las cuentas se activan cuando se configure Supabase en assets/config.js." },
    en: { soonT: "Coming soon", soonP: "Purchases of {p} open in the next few days. Leave your email and we’ll tell you first.", soonBtn: "Notify me", soonOk: "Done. We’ll write to {e} as soon as it opens.", mailUs: "Or email us at {m}", eDomain: "This domain isn’t authorized for sign-in yet.", login: "Log in", signup: "Create account", google: "Continue with Google", or: "or with your email", name: "Full name", email: "Email", password: "Password", pwHint: "At least 8 characters", newpw: "New password", forgot: "Forgot your password?", sendReset: "Send link", back: "Back to log in", save: "Save password", terms: "I accept the {t} and the {p}.", termsT: "Terms", termsP: "Privacy policy", optin: "Send me the Ferro index every Monday.", haveAcc: "Already have an account?", noAcc: "No account yet?", resetTitle: "Reset password", newTitle: "Choose a new password", close: "Close",
      checkEmail: "Done. We sent an email to {e} to activate your account. If it doesn’t arrive within 5 minutes, check spam or promotions.", resetSent: "If an account exists for {e}, you’ll get a link to reset your password.", pwSaved: "Password updated. You can now use the app.", resend: "Resend activation email", resent: "Email sent again.",
      eInvalid: "Wrong email or password.", eConfirm: "Your account isn’t activated yet. Check your email.", eExists: "An account with that email already exists. Log in or reset your password.", eRate: "Too many attempts right now. Wait a few minutes or use Google.", eWeak: "Password must be at least 8 characters.", eTerms: "You must accept the terms and privacy policy.", eEmail: "Enter a valid email.", eGeneric: "We couldn’t complete that. Please try again.", eNet: "Can’t reach the server. Check your connection.", demo: "Demo mode: accounts turn on once Supabase is set in assets/config.js." },
    pt: { soonT: "Em breve", soonP: "As compras de {p} abrem nos próximos dias. Deixe seu e-mail e avisamos você primeiro.", soonBtn: "Avise-me", soonOk: "Pronto. Vamos escrever para {e} assim que abrir.", mailUs: "Ou escreva para {m}", eDomain: "Este domínio ainda não está autorizado para login.", login: "Entrar", signup: "Criar conta", google: "Continuar com Google", or: "ou com seu e-mail", name: "Nome completo", email: "E-mail", password: "Senha", pwHint: "Mínimo de 8 caracteres", newpw: "Nova senha", forgot: "Esqueceu a senha?", sendReset: "Enviar link", back: "Voltar para entrar", save: "Salvar senha", terms: "Aceito os {t} e a {p}.", termsT: "Termos", termsP: "Política de privacidade", optin: "Quero receber o índice Ferro toda segunda.", haveAcc: "Já tem conta?", noAcc: "Ainda não tem conta?", resetTitle: "Recuperar senha", newTitle: "Escolha uma nova senha", close: "Fechar",
      checkEmail: "Pronto. Enviamos um e-mail para {e} para ativar sua conta. Se não chegar em 5 minutos, verifique o spam ou promoções.", resetSent: "Se existir uma conta com {e}, você receberá um link para trocar a senha.", pwSaved: "Senha atualizada. Você já pode usar o app.", resend: "Reenviar e-mail de ativação", resent: "E-mail reenviado.",
      eInvalid: "E-mail ou senha incorretos.", eConfirm: "Sua conta ainda não foi ativada. Verifique seu e-mail.", eExists: "Já existe uma conta com esse e-mail. Entre ou recupere a senha.", eRate: "Muitas tentativas agora. Aguarde alguns minutos ou use o Google.", eWeak: "A senha deve ter pelo menos 8 caracteres.", eTerms: "Você precisa aceitar os termos e a política de privacidade.", eEmail: "Digite um e-mail válido.", eGeneric: "Não foi possível concluir. Tente novamente.", eNet: "Sem conexão com o servidor. Verifique sua internet.", demo: "Modo demo: as contas são ativadas quando o Supabase for configurado em assets/config.js." },
    fr: { soonT: "Bientôt disponible", soonP: "Les achats de {p} ouvrent dans les prochains jours. Laissez votre e-mail et nous vous préviendrons en premier.", soonBtn: "Me prévenir", soonOk: "C’est noté. Nous écrirons à {e} dès l’ouverture.", mailUs: "Ou écrivez-nous à {m}", eDomain: "Ce domaine n’est pas encore autorisé pour la connexion.", login: "Se connecter", signup: "Créer un compte", google: "Continuer avec Google", or: "ou avec votre e-mail", name: "Nom complet", email: "E-mail", password: "Mot de passe", pwHint: "8 caractères minimum", newpw: "Nouveau mot de passe", forgot: "Mot de passe oublié ?", sendReset: "Envoyer le lien", back: "Retour à la connexion", save: "Enregistrer", terms: "J’accepte les {t} et la {p}.", termsT: "Conditions", termsP: "Politique de confidentialité", optin: "Recevoir l’indice Ferro chaque lundi.", haveAcc: "Déjà un compte ?", noAcc: "Pas encore de compte ?", resetTitle: "Réinitialiser le mot de passe", newTitle: "Choisissez un nouveau mot de passe", close: "Fermer",
      checkEmail: "C’est fait. Nous avons envoyé un e-mail à {e} pour activer votre compte. S’il n’arrive pas d’ici 5 minutes, vérifiez vos spams ou l’onglet promotions.", resetSent: "Si un compte existe pour {e}, vous recevrez un lien pour changer le mot de passe.", pwSaved: "Mot de passe mis à jour. Vous pouvez utiliser l’app.", resend: "Renvoyer l’e-mail d’activation", resent: "E-mail renvoyé.",
      eInvalid: "E-mail ou mot de passe incorrect.", eConfirm: "Votre compte n’est pas encore activé. Vérifiez vos e-mails.", eExists: "Un compte existe déjà avec cet e-mail. Connectez-vous ou réinitialisez le mot de passe.", eRate: "Trop de tentatives. Patientez quelques minutes ou utilisez Google.", eWeak: "Le mot de passe doit contenir au moins 8 caractères.", eTerms: "Vous devez accepter les conditions et la politique de confidentialité.", eEmail: "Saisissez un e-mail valide.", eGeneric: "Action impossible. Réessayez.", eNet: "Serveur injoignable. Vérifiez votre connexion.", demo: "Mode démo : les comptes s’activent une fois Supabase configuré dans assets/config.js." }
  };
  function at(k) { var l = getLang(); return (A[l] && A[l][k]) || A.es[k] || k; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function mapError(err) {
    var code = String((err && err.code) || "");
    var F = { "auth/invalid-credential": "eInvalid", "auth/invalid-login-credentials": "eInvalid", "auth/wrong-password": "eInvalid", "auth/user-not-found": "eInvalid",
      "auth/email-already-in-use": "eExists", "auth/too-many-requests": "eRate", "auth/weak-password": "eWeak", "auth/network-request-failed": "eNet",
      "auth/invalid-email": "eEmail", "ferro/not-verified": "eConfirm", "auth/unauthorized-domain": "eDomain" };
    if (F[code]) return at(F[code]);
    var m = String((err && (err.message || err.msg || err.error_description)) || err || "").toLowerCase();
    if (m.indexOf("invalid login") > -1) return at("eInvalid");
    if (m.indexOf("not confirmed") > -1) return at("eConfirm");
    if (m.indexOf("already registered") > -1 || m.indexOf("already been registered") > -1 || m.indexOf("user_already_exists") > -1) return at("eExists");
    if (m.indexOf("rate limit") > -1 || m.indexOf("too many") > -1 || m.indexOf("security purposes") > -1) return at("eRate");
    if (m.indexOf("password") > -1 && (m.indexOf("6") > -1 || m.indexOf("8") > -1 || m.indexOf("weak") > -1 || m.indexOf("short") > -1)) return at("eWeak");
    if (m.indexOf("failed to fetch") > -1 || m.indexOf("network") > -1) return at("eNet");
    return at("eGeneric");
  }

  /* ---------- modal de cuentas ---------- */
  var modal = null, mode = "login", lastEmail = "";
  var CSS = ".fx-modal{border:0;padding:0;border-radius:6px;width:min(440px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;background:#fff;color:#0A1626;box-shadow:0 30px 80px rgba(10,22,38,.35);font-family:'Archivo',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif}" +
    ".fx-modal::backdrop{background:rgba(10,22,38,.55)}" +
    ".fx-head{background:#0F2A4A;color:#EDF1F5;padding:20px 22px;display:flex;align-items:center;justify-content:space-between;gap:12px;background-image:linear-gradient(rgba(237,241,245,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(237,241,245,.07) 1px,transparent 1px);background-size:18px 18px}" +
    ".fx-head b{font-stretch:125%;font-weight:800;font-size:20px;letter-spacing:-.02em}" +
    ".fx-x{background:none;border:0;color:#EDF1F5;font-size:26px;line-height:1;cursor:pointer;padding:2px 6px}" +
    ".fx-body{padding:22px;display:grid;gap:12px}" +
    ".fx-tabs{display:grid;grid-template-columns:1fr 1fr;border:1px solid rgba(15,42,74,.18);border-radius:4px;overflow:hidden}" +
    ".fx-tabs button{font:600 14px inherit;font-family:inherit;padding:10px;border:0;background:#fff;color:#3B4A5E;cursor:pointer}" +
    ".fx-tabs button[aria-selected=true]{background:#0F2A4A;color:#fff}" +
    ".fx-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;font:600 15px inherit;font-family:inherit;padding:12px 14px;border-radius:4px;border:1.5px solid #0F2A4A;background:#0F2A4A;color:#fff;cursor:pointer}" +
    ".fx-btn.g{background:#fff;color:#0A1626;border-color:rgba(15,42,74,.25)}" +
    ".fx-btn[disabled]{opacity:.6;cursor:wait}" +
    ".fx-or{display:flex;align-items:center;gap:10px;font-size:13px;color:#5B6878}.fx-or:before,.fx-or:after{content:'';flex:1;height:1px;background:rgba(15,42,74,.15)}" +
    ".fx-f label{display:block;font-size:13.5px;font-weight:600;margin-bottom:5px}" +
    ".fx-f input{width:100%;box-sizing:border-box;font:16px inherit;font-family:inherit;padding:11px 12px;border:1.5px solid rgba(15,42,74,.22);border-radius:4px;background:#F7F9FB;color:#0A1626}" +
    ".fx-f input:focus{outline:3px solid rgba(31,79,163,.35);border-color:#1F4FA3}" +
    ".fx-hint{font-size:12.5px;color:#5B6878;margin-top:4px}" +
    ".fx-chk{display:flex;gap:9px;align-items:flex-start;font-size:13.5px;line-height:1.4}.fx-chk input{margin-top:2px;width:16px;height:16px;flex:none}" +
    ".fx-chk a,.fx-link{color:#1F4FA3}" +
    ".fx-link{background:none;border:0;padding:0;font:600 13.5px inherit;font-family:inherit;cursor:pointer;text-decoration:underline}" +
    ".fx-msg{font-size:14px;padding:10px 12px;border-radius:4px;display:none}.fx-msg.ok{display:block;background:#E5F4E4;color:#14532D}.fx-msg.err{display:block;background:#FBEBEB;color:#8A2A16}" +
    ".fx-foot{font-size:13.5px;color:#3B4A5E;text-align:center}" +
    ".fx-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}" +
    "@media (prefers-color-scheme:dark){.fx-modal{background:#11243D;color:#E6ECF3}.fx-tabs button{background:#11243D;color:#A9B6C6}.fx-btn.g{background:#0E2036;color:#E6ECF3;border-color:rgba(237,241,245,.2)}.fx-f input{background:#0E2036;color:#E6ECF3;border-color:rgba(237,241,245,.2)}.fx-foot,.fx-hint,.fx-or{color:#A9B6C6}.fx-chk a,.fx-link{color:#8DB0EE}}";
  var GOOGLE_SVG = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';


  function ensureModal() {
    if (modal) return;
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    modal = document.createElement("dialog");
    modal.className = "fx-modal";
    modal.setAttribute("aria-labelledby", "fx-title");
    document.body.appendChild(modal);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeAuth(); });
    modal.addEventListener("cancel", function (e) { if (mode === "newpass") e.preventDefault(); });
  }
  function legalUrl(h) { return base() + "/legal.html?lang=" + getLang() + "#" + h; }
  function paintModal(msg, kind) {
    if (mode === "soon") return paintSoon(msg, kind);
    var title = mode === "signup" ? at("signup") : mode === "reset" ? at("resetTitle") : mode === "newpass" ? at("newTitle") : at("login");
    var h = '<div class="fx-head"><b id="fx-title">' + esc(title) + '</b>' + (mode === "newpass" ? "" : '<button class="fx-x" type="button" data-fx="close" aria-label="' + esc(at("close")) + '">×</button>') + "</div><div class=\"fx-body\">";
    if (mode === "login" || mode === "signup") {
      h += '<div class="fx-tabs" role="tablist"><button type="button" role="tab" data-fx="tab-login" aria-selected="' + (mode === "login") + '">' + esc(at("login")) + '</button><button type="button" role="tab" data-fx="tab-signup" aria-selected="' + (mode === "signup") + '">' + esc(at("signup")) + "</button></div>";
      if (C.googleLogin !== false) h += '<button class="fx-btn g" type="button" data-fx="google">' + GOOGLE_SVG + esc(at("google")) + '</button><div class="fx-or">' + esc(at("or")) + "</div>";
    }
    h += '<form class="fx-body" style="padding:0" novalidate data-fx="form">';
    h += '<input class="fx-hp" tabindex="-1" autocomplete="off" name="website" aria-hidden="true">';
    if (mode === "signup") h += '<div class="fx-f"><label for="fx-name">' + esc(at("name")) + '</label><input id="fx-name" name="name" autocomplete="name" required></div>';
    if (mode !== "newpass") h += '<div class="fx-f"><label for="fx-email">' + esc(at("email")) + '</label><input id="fx-email" name="email" type="email" autocomplete="email" required value="' + esc(lastEmail) + '"></div>';
    if (mode === "login" || mode === "signup" || mode === "newpass") h += '<div class="fx-f"><label for="fx-pw">' + esc(mode === "newpass" ? at("newpw") : at("password")) + '</label><input id="fx-pw" name="password" type="password" minlength="8" autocomplete="' + (mode === "login" ? "current-password" : "new-password") + '" required>' + (mode !== "login" ? '<div class="fx-hint">' + esc(at("pwHint")) + "</div>" : "") + "</div>";
    if (mode === "signup") {
      var tl = at("terms").replace("{t}", '<a href="' + legalUrl("terms") + '" target="_blank" rel="noopener">' + esc(at("termsT")) + "</a>").replace("{p}", '<a href="' + legalUrl("privacy") + '" target="_blank" rel="noopener">' + esc(at("termsP")) + "</a>");
      h += '<label class="fx-chk"><input type="checkbox" name="terms" required><span>' + tl + '</span></label><label class="fx-chk"><input type="checkbox" name="optin"><span>' + esc(at("optin")) + "</span></label>";
    }
    h += '<div class="fx-msg ' + (kind || "") + '" role="status" data-fx="msg">' + (msg || "") + "</div>";
    var btn = mode === "signup" ? at("signup") : mode === "reset" ? at("sendReset") : mode === "newpass" ? at("save") : at("login");
    h += '<button class="fx-btn" type="submit">' + esc(btn) + "</button></form>";
    if (mode === "login") h += '<div class="fx-foot"><button class="fx-link" type="button" data-fx="tab-reset">' + esc(at("forgot")) + "</button></div>";
    if (mode === "reset") h += '<div class="fx-foot"><button class="fx-link" type="button" data-fx="tab-login">' + esc(at("back")) + "</button></div>";
    h += "</div>";
    modal.innerHTML = h;
    modal.querySelectorAll("[data-fx]").forEach(function (el) {
      var a = el.getAttribute("data-fx");
      if (a === "close") el.onclick = closeAuth;
      if (a === "tab-login") el.onclick = function () { keepEmail(); mode = "login"; paintModal(); };
      if (a === "tab-signup") el.onclick = function () { keepEmail(); mode = "signup"; paintModal(); };
      if (a === "tab-reset") el.onclick = function () { keepEmail(); mode = "reset"; paintModal(); };
      if (a === "google") el.onclick = google;
      if (a === "form") el.addEventListener("submit", submit);
    });
  }
  function keepEmail() { var e = modal.querySelector("#fx-email"); if (e) lastEmail = e.value.trim(); }
  function setMsg(text, kind, html) {
    var m = modal.querySelector('[data-fx="msg"]'); if (!m) return;
    m.className = "fx-msg " + kind; if (html) m.innerHTML = text; else m.textContent = text;
  }
  function busy(on) { var b = modal.querySelector('button[type="submit"]'); if (b) b.disabled = !!on; }
  function showModal() {
    if (!modal.open) { try { modal.showModal(); } catch (e) { modal.setAttribute("open", ""); } }
    setTimeout(function () { var f = modal.querySelector("input:not(.fx-hp)"); if (f) f.focus(); }, 30);
  }
  function openAuth(m) {
    ensureModal(); mode = m || "login";
    if (!configured) { mode = "soon"; soonProduct = null; }
    paintModal(); showModal();
  }
  function closeAuth() { if (modal && modal.open) { try { modal.close(); } catch (e) { modal.removeAttribute("open"); } } }
  function afterLogin() { closeAuth(); if (!/app\.html/.test(location.pathname)) location.href = appUrl(); }
  function google() {
    if (!B) { setMsg(at("eGeneric"), "err"); return; }
    Promise.resolve(B.google()).then(function (r) { if (r && B.name === "firebase") afterLogin(); })
      .catch(function (e) { setMsg(mapError(e), "err"); });
  }
  var lastPw = "";
  function submit(e) {
    e.preventDefault();
    var f = e.target, fd = new FormData(f);
    if (fd.get("website")) return; // bot
    var email = String(fd.get("email") || "").trim(), pw = String(fd.get("password") || "");
    lastEmail = email; lastPw = pw;
    if (mode !== "newpass" && !EMAIL_RE.test(email)) { setMsg(at("eEmail"), "err"); return; }
    if ((mode === "signup" || mode === "newpass") && pw.length < 8) { setMsg(at("eWeak"), "err"); return; }
    if (mode === "signup" && !fd.get("terms")) { setMsg(at("eTerms"), "err"); return; }
    if (!B) { setMsg(at("eGeneric"), "err"); return; }
    busy(true);
    var p;
    if (mode === "login") {
      p = B.signIn(email, pw).then(afterLogin, function (err) {
        var msg = mapError(err);
        if (msg === at("eConfirm")) { setMsg(esc(msg) + ' <button class="fx-link" type="button" data-fx-resend>' + esc(at("resend")) + "</button>", "err", true); wireResend(email); }
        else setMsg(msg, "err");
      });
    } else if (mode === "signup") {
      var name = String(fd.get("name") || "").trim();
      var meta = { full_name: name, lang: getLang(), marketing_opt_in: !!fd.get("optin"), terms_accepted_at: new Date().toISOString() };
      p = B.signUp(email, pw, meta).then(function (r) {
        if (fd.get("optin")) subscribe({ email: email, source: "signup" });
        if (r && r.needsConfirm === false) { afterLogin(); return; }
        setMsg(esc(at("checkEmail").replace("{e}", email)) + ' <button class="fx-link" type="button" data-fx-resend>' + esc(at("resend")) + "</button>", "ok", true); wireResend(email);
      }, function (err) { setMsg(mapError(err), "err"); });
    } else if (mode === "reset") {
      p = Promise.resolve(B.reset(email)).then(function () { setMsg(at("resetSent").replace("{e}", email), "ok"); }, function (err) { setMsg(mapError(err), "err"); });
    } else if (mode === "newpass") {
      p = B.updatePassword(pw).then(function () { setMsg(at("pwSaved"), "ok"); mode = "login"; setTimeout(closeAuth, 1500); }, function (err) { setMsg(mapError(err), "err"); });
    }
    Promise.resolve(p).then(function () { busy(false); }, function () { busy(false); });
  }
  function wireResend(email) {
    var b = modal.querySelector("[data-fx-resend]"); if (!b) return;
    b.onclick = function () {
      Promise.resolve(B.resend(email, lastPw)).then(function () { setMsg(at("resent"), "ok"); }, function (err) { setMsg(mapError(err), "err"); });
    };
  }

  /* ---------- "Muy pronto": compras sin enlace y cuentas aún no activas ---------- */
  var soonProduct = null;
  var PNAME = { kit: "Ferro Kit", review: "Ferro Review", pro: "Index Pro", briefing: "Ferro Briefing" };
  function paintSoon(msg, kind) {
    var mail = C.email || "";
    var p = soonProduct ? PNAME[soonProduct] || soonProduct : "Ferro";
    var h = '<div class="fx-head"><b id="fx-title">' + esc(at("soonT")) + '</b><button class="fx-x" type="button" data-fx="close" aria-label="' + esc(at("close")) + '">×</button></div><div class="fx-body">';
    h += '<p style="margin:0;font-size:15px;line-height:1.5">' + esc(at("soonP").replace("{p}", p)) + "</p>";
    h += '<form class="fx-body" style="padding:0" novalidate data-fx="soonform"><input class="fx-hp" tabindex="-1" autocomplete="off" name="website" aria-hidden="true">';
    h += '<div class="fx-f"><label for="fx-email">' + esc(at("email")) + '</label><input id="fx-email" name="email" type="email" autocomplete="email" required value="' + esc(lastEmail) + '"></div>';
    h += '<div class="fx-msg ' + (kind || "") + '" role="status" data-fx="msg">' + (msg || "") + "</div>";
    h += '<button class="fx-btn" type="submit">' + esc(at("soonBtn")) + "</button></form>";
    if (mail) h += '<div class="fx-foot">' + esc(at("mailUs")).replace("{m}", '<a class="fx-link" href="mailto:' + esc(mail) + "?subject=" + encodeURIComponent("Ferro · " + p) + '">' + esc(mail) + "</a>") + "</div>";
    h += "</div>";
    modal.innerHTML = h;
    modal.querySelector('[data-fx="close"]').onclick = closeAuth;
    modal.querySelector('[data-fx="soonform"]').addEventListener("submit", function (e) {
      e.preventDefault(); var fd = new FormData(e.target); if (fd.get("website")) return;
      var em = String(fd.get("email") || "").trim(); lastEmail = em;
      if (!EMAIL_RE.test(em)) { setMsg(at("eEmail"), "err"); return; }
      busy(true);
      contact({ email: em, topic: "waitlist", message: "Waitlist: " + p }).then(function () { setMsg(at("soonOk").replace("{e}", em), "ok"); busy(false); });
    });
  }
  function openSoon(product) { ensureModal(); mode = "soon"; soonProduct = product || null; paintModal(); showModal(); }

  /* ---------- formularios públicos ---------- */
  function notify(kind, row) {
    // Aviso por correo con FormSubmit (gratis). Se activa con config.notifyEmail.
    var to = C.notifyEmail; if (!to || location.protocol === "file:") return Promise.resolve(false);
    var body = Object.assign({ _subject: "Ferro · " + (kind === "contact" ? "Nuevo mensaje" : kind === "waitlist" ? "Lista de espera" : "Nuevo suscriptor") + " (" + (row.email || "") + ")", _template: "table", _captcha: "false", tipo: kind, pagina: location.href }, row);
    if (row.email) body._replyto = row.email;
    return fetch("https://formsubmit.co/ajax/" + encodeURIComponent(to), { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.ok; }).catch(function () { return false; });
  }
  function subscribe(d) {
    var row = { email: String(d.email || "").trim().toLowerCase(), country: d.country || null, role: d.role || null, lang: getLang(), source: d.source || "landing" };
    saveLocal("ferro_subscribers", row);
    var n = configured ? Promise.resolve(false) : notify("subscriber", row);
    return ready.then(function () {
      if (!B) return n.then(function (ok) { return { ok: true, emailed: ok }; });
      return Promise.resolve(B.insert("subscribers", Object.assign({}, row))).then(function () { return { ok: true }; })
        .catch(function (e) { console.warn(e); return notify("subscriber", row).then(function (ok) { return { ok: ok }; }); });
    });
  }
  function contact(d) {
    var row = { name: d.name || null, email: String(d.email || "").trim().toLowerCase(), company: d.company || null, country: d.country || null, topic: d.topic || null, message: String(d.message || "").slice(0, 5000), lang: getLang() };
    if (currentUser) row.user_id = currentUser.id;
    saveLocal("ferro_contacts", row);
    var n = notify(d.topic === "waitlist" ? "waitlist" : "contact", row); // siempre avisa por correo
    return ready.then(function () {
      if (!B) return n.then(function (ok) { return { ok: true, emailed: ok }; });
      return Promise.resolve(B.insert("contact_messages", Object.assign({ status: "new" }, row))).then(function () { return { ok: true }; })
        .catch(function (e) { console.warn(e); return n.then(function (ok) { return { ok: ok }; }); });
    });
  }
  function saveLocal(k, row) {
    try { var a = JSON.parse(sget(k) || "[]"); row = Object.assign({ ts: new Date().toISOString() }, row); a.push(row); sset(k, JSON.stringify(a.slice(-200))); } catch (e) {}
  }

  /* ---------- datos del usuario (app) ---------- */
  var db = {
    getProfile: function () { return ready.then(function () { return B && currentUser ? B.getProfile(currentUser.id) : null; }).catch(function () { return null; }); },
    saveProfile: function (row) { return ready.then(function () { if (!B || !currentUser) return false; return Promise.resolve(B.saveProfile(currentUser.id, Object.assign({ email: currentUser.email }, row))).then(function () { return true; }); }); },
    saveScenario: function (model, inputs) { return ready.then(function () { if (!B || !currentUser) return false; return Promise.resolve(B.saveScenario(currentUser.id, model, inputs)).then(function () { return true; }, function () { return false; }); }); },
    loadScenarios: function () { return ready.then(function () { if (!B || !currentUser) return {}; return B.loadScenarios(currentUser.id); }).catch(function () { return {}; }); },
    adminList: function (col) { return ready.then(function () { if (!B || !currentUser) throw new Error("denied"); return B.adminList(col); }); }
  };

  /* ---------- checkout (Polar para Kit/Pro, Stripe/PayPal para servicios) ---------- */
  var POLAR_LOCALE = { es: "es", en: "en", pt: "pt-BR", fr: "fr" };
  function checkoutUrl(product, extra) {
    var u = C.polar[product]; if (!u) return null;
    try {
      var url = new URL(u);
      var isPolar = /(^|\.)polar\.sh$/.test(url.hostname);
      if (!isPolar) {
        if (/(^|\.)stripe\.com$/.test(url.hostname) && currentUser && currentUser.email) url.searchParams.set("prefilled_email", currentUser.email);
        return url.toString();
      }
      if (currentUser) {
        if (currentUser.email) url.searchParams.set("customer_email", currentUser.email);
        var nm = currentUser.user_metadata && currentUser.user_metadata.full_name;
        if (nm) url.searchParams.set("customer_name", nm);
        url.searchParams.set("reference_id", currentUser.id);
      }
      url.searchParams.set("locale", POLAR_LOCALE[getLang()] || "en");
      url.searchParams.set("utm_source", "ferro_site");
      if (extra && extra.medium) url.searchParams.set("utm_medium", extra.medium);
      return url.toString();
    } catch (e) { return u; }
  }
  function wireBuyButtons(root) {
    (root || document).querySelectorAll("[data-buy]").forEach(function (a) {
      if (a.__fx) return; a.__fx = true;
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var product = a.getAttribute("data-buy");
        var url = checkoutUrl(product, { medium: a.getAttribute("data-medium") || location.pathname.replace(/.*\//, "") || "index" });
        if (!url) { openSoon(product); return; }
        window.open(url, "_blank", "noopener");
      });
    });
  }

  window.Ferro = {
    config: C, langs: LANGS, locale: function () { return LOC[getLang()]; },
    getLang: getLang, setLang: setLang, base: base, appUrl: appUrl, legalUrl: legalUrl,
    configured: configured, backend: backend, ready: ready,
    getUser: getUser, onAuth: onAuth, signOut: signOut, isAdmin: isAdmin, user: function () { return currentUser; },
    openAuth: openAuth, closeAuth: closeAuth, openSoon: openSoon,
    subscribe: subscribe, contact: contact, db: db, checkoutUrl: checkoutUrl, wireBuyButtons: wireBuyButtons,
    esc: esc, EMAIL_RE: EMAIL_RE
  };
})();
