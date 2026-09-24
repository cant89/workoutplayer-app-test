/* WorkoutPlayer · lingue (T2). Cinque lingue dell'interfaccia: IT, EN, FR, ES, DE, un file per lingua in lib/lang/<codice>.js
   che registra le sue chiavi con WorkoutPlayer.i18n.add(codice, { chiave: testo }).
   Due lingue in gioco nello stesso momento:
   - l'interfaccia, nella lingua scelta (opzione lang del player); senza, nella lingua del piano se è una delle cinque. Dal T2
     passo 9 (#61) l'app passa la lingua della scheda (o, se l'utente lo sceglie nelle impostazioni, la lingua dell'app): durante
     l'allenamento il player non mescola più l'interfaccia in una lingua e i testi e la voce in un'altra;
   - la voce e i testi che la voce legge (etichette di serie, ripetizioni, durate), nella lingua del piano (plan.lang)
     se è una delle cinque; altrimenti niente voce: bip e testo, con l'avviso nelle impostazioni audio (AC-P4').
   I testi del piano (nomi, note, istruzioni) non si traducono: restano nella lingua della scheda.
   t(lingua, chiave, parametri): "{n}" nel testo diventa parametri.n. Con n = 1 vale la variante "<chiave>.one" se la
   lingua la definisce (singolare: "1 giro", "1 set"). Una chiave che manca nella lingua cade sull'italiano
   (tests/i18n.test.js controlla che nessuna chiave manchi). */
(function (WP) {
  "use strict";
  const LANGS = ["it", "en", "fr", "es", "de"];
  const dicts = {};
  // "it-IT", "fr", "de-CH" → "it", "fr", "de"; una lingua fuori dalle cinque → null
  const code = tag => { const c = String(tag || "").slice(0, 2).toLowerCase(); return LANGS.includes(c) ? c : null; };
  function add(lang, keys) { dicts[lang] = Object.assign(dicts[lang] || {}, keys); }
  function t(lang, key, params) {
    const d = dicts[lang] || {};
    let s = params && Number(params.n) === 1 && d[key + ".one"] != null ? d[key + ".one"] : d[key];
    if (s == null) s = (dicts.it || {})[key];
    if (s == null) return key;
    return params ? s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m)) : s;
  }
  // la prima lingua del browser fra le cinque; nessuna ⇒ inglese
  const pick = tags => { for (const tag of tags || []) { const c = code(tag); if (c) return c; } return "en"; };
  WP.i18n = { LANGS, dicts, add, t, code, pick };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
