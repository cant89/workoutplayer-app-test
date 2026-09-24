/* WorkoutPlayer · punto d'ingresso della libreria (API v0: lib/API-v0.md; API v1: lib/API-v1.md).

   await WorkoutPlayer.start({ plan, images, composeSource, timeoutMs })
       esegue lo script del piano isolato (lib/engine/isolate.js), controlla i passi e monta il player nella pagina
       (lo scheletro lib/shell.html deve esserci). Senza composeSource, o se lo script fallisce, scade o restituisce
       passi non validi, la sequenza la dà il rendering di riserva dai soli dati. Segna <html data-player="script|riserva">.
   WorkoutPlayer.create({ plan, images, compose | steps })
       costruisce il runtime senza toccare il DOM (test, verificatore). compose = funzione eseguita qui, senza isolamento:
       solo per codice fidato (test); steps = passi già calcolati.

   plan    = dati del piano (plans/<piano>/plan.json)
   images  = { nome: URL o data URI } (plans/<piano>/images/)
   script  = function compose(plan, api) { return { idSeduta: [passi] } } (plans/<piano>/compose.js)

   Il runtime R tiene lo stato della seduta (R.W, R.STEPS, R.cur) e le funzioni di motore (lib/engine/) e componenti
   (lib/ui/), che si chiamano fra loro attraverso R.
   Versione (regola AC-L7): il piano dichiara in plan.api l'API con cui è stato scritto ("v0" se manca); lo script riceve
   l'API di quella versione e i passi si controllano, si rendono in riserva e si mostrano con le regole di quella versione
   (R.version, R.v1). Un piano con una versione non supportata va in riserva con le regole più recenti.

   Opzioni aggiunte in T2 (le passa l'app, app/; senza, il player è quello di T1, a parità con l'artifact):
   lang         lingua dell'interfaccia fra it, en, fr, es, de (lib/i18n.js); senza, italiano. La voce usa la lingua del piano.
   settingsKey  chiave della memoria comune delle impostazioni audio (bip, voce, preparazione) fra tutti i piani
   diary        true: ripetizioni fatte nel passo, diario per serie, "serie fatte" e diario nella schermata finale
   editSets     true: "aggiungi / togli una serie" nei passi di lavoro, serie aggiunte marcate (AC-P9)
   marks        { "seduta/fase" | "seduta/fase/voce": [{ field, state: "confirmed" | "corrected" | "unverified", value, original }] }:
                valori confermati o corretti dall'utente in revisione (AC-R4), o ancora da verificare (anteprima), mostrati nei passi
   Forme dei dati che la libreria accetta in più dal T2 e che producono solo le correzioni della revisione (non il generatore:
   lib/API-v1.md, che il generatore riceve nel prompt, non le elenca): durata di una voce a tempo come intervallo
   dur: { min, max }; più serie per giro di una voce di circuito (sets > 1, il rendering di riserva le guida giro per giro).
   T2 passo 9, solo piani v1, per la sequenza dello script e per quella di riserva: il recupero dopo l'ultima serie di una fase, se è
   l'unico punto in cui i dati lo danno, diventa un passo di recupero prima della fase dopo (WP.v1.keepRests; dopo l'ultima fase
   della seduta lo scrive la schermata finale, WP.v1.endRest). lib/API-v1.md dice "nessun recupero prima di una nuova fase": vale
   ancora per la sequenza che lo script restituisce, non per quella che il player esegue. */
(function (WP) {
  "use strict";
  const MODULES = ["store", "texts", "audio", "wakelock", "session", "shell", "home", "preview", "player", "list", "dialogs", "done", "events"];
  const copy = v => JSON.parse(JSON.stringify(v));

  WP.create = function (opts) {
    const plan = opts.plan;
    const supported = WP.SUPPORTED_APIS.includes(plan.api || "v0");
    const version = supported ? plan.api || "v0" : WP.API_VERSION;
    let raw = opts.steps || null, reason = opts.fallbackReason || null;
    if (!supported) { raw = null; reason = "API " + plan.api + " non supportata"; }
    else if (!raw && typeof opts.compose === "function") {
      try { raw = opts.compose(copy(plan), WP.api(version)); } catch (e) { reason = "errore dello script: " + e.message; }
    }
    let steps = null;
    if (raw) {
      const res = WP.acceptSteps(plan, raw);
      if (res.problems.length) reason = "passi rifiutati: " + res.problems.slice(0, 3).join("; "); else steps = res.steps;
    }
    const keyOf = new Map(Object.keys(plan.workouts).map(k => [plan.workouts[k], k]));
    // piani v1: il recupero che la sequenza toglierebbe a fine fase resta se è l'unico punto in cui i dati lo danno (WP.v1.keepRests)
    const sequence = steps ? (w => steps[keyOf.get(w)]) : (w => WP.fallbackSteps(w, version));
    const lang = WP.i18n.code(opts.lang) || "it";
    const R = {
      plan, EX: plan.exercises, WORKOUTS: plan.workouts, IMG: opts.images || {}, version, v1: version === "v1",
      mode: steps ? "script" : "riserva", fallbackReason: steps ? null : reason,
      buildSteps: version === "v1" ? (w => WP.v1.keepRests(w, sequence(w))) : sequence,
      // una sola memoria per piano: la seduta salvata dice con quale sequenza (script o riserva) è stata salvata
      storageKey: plan.storageKey || "workoutplayer-" + plan.id,
      // T2: lingua dell'interfaccia e della voce (null = lingua del piano fuori dalle cinque: niente voce), opzioni dell'app
      lang, voiceLang: WP.i18n.code(plan.lang), t: (key, p) => WP.i18n.t(lang, key, p),
      settingsKey: opts.settingsKey || null, features: { diary: !!opts.diary, editSets: !!opts.editSets }, marks: opts.marks || {}
    };
    MODULES.forEach(name => Object.assign(R, WP.modules[name](R)));
    return R;
  };

  WP.start = async function (opts) {
    let steps = null, reason = null;
    if (opts.composeSource) {
      const res = await WP.composeIsolated(opts.plan, opts.composeSource, opts.timeoutMs, opts.lang);
      if (res.ok) steps = res.steps; else reason = res.error;
    }
    const R = WP.create(Object.assign({}, opts, { steps, fallbackReason: reason, compose: undefined }));
    document.documentElement.dataset.player = R.mode;
    if (R.fallbackReason) console.warn("WorkoutPlayer: rendering di riserva (" + R.fallbackReason + ")");
    R.fillShell(); R.wireEvents(); R.renderHome(); R.show("home");
    R.resumeInterrupted();
    return R;
  };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
