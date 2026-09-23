/* WorkoutPlayer · motore: i passi di una seduta, per versione dell'API (lib/API-v0.md, lib/API-v1.md).
   - defineApi: l'API che lo script di composizione riceve (versione e costruttori dei passi). È una funzione autonoma
     perché la libreria la esegue sia nella pagina sia, come testo, nel Worker isolato dove gira lo script (lib/engine/isolate.js).
   - acceptSteps: il controllo dei passi che lo script restituisce, prima di usarli; le regole sono quelle della versione
     dichiarata dal piano (plan.api). Regola AC-L7: ogni versione resta supportata finché esiste un piano che la usa;
     un piano v0 si legge solo con le regole v0 (stessi passi e stessi testi di prima).
   - timing: quanto dura un passo e come si mostra il suo orologio (conto alla rovescia, cronometro, tenuta);
   - stime ricavate dalla sequenza: durata prevista, serie e blocchi. Da src/app1.js:17, 45-78.

   Un passo è un oggetto semplice:
     { type: "gate", pi }                                     inizio di una fase (ci si ferma, si legge, si parte)
     { type: "prep" | "work" | "rest", pi, ii, set, sets, round }   v1: prep e work anche con side e part
     { type: "free", pi }  oppure  { type: "free", pi, ii, set, sets, round }
     { type: "block", pi, round }                             v1: blocco a cronometro (EMOM: un passo per intervallo;
                                                              AMRAP e For Time: un passo per tutto il blocco, round 0)
   pi = fase, ii = voce, set/sets = serie corrente e totale (v1, voce per lato: serie per lato), round = giro (0 fuori dai giri),
   side = lato (indice in voce.sides), part = parte della serie (indice nelle parti di una serie composta, oppure
   0 = serie e 1..n = scalate del drop set). */
(function (WP) {
  "use strict";

  function defineApi(WP) {
    "use strict";
    function check(type, o, keys) {
      keys.forEach(function (k) {
        if (!Number.isInteger(o[k]) || o[k] < 0) throw new TypeError("passo " + type + ": '" + k + "' deve essere un intero >= 0");
      });
    }
    var ITEM_KEYS = ["pi", "ii", "set", "sets", "round"];
    function make(version) {
      var v1 = version === "v1";
      function gate(o) { o = o || {}; check("gate", o, ["pi"]); return { type: "gate", pi: o.pi }; }
      function itemStep(type, extra) {
        return function (o) {
          o = o || {}; check(type, o, ITEM_KEYS);
          var s = { type: type, pi: o.pi, ii: o.ii, set: o.set, sets: o.sets, round: o.round };
          if (extra) ["side", "part"].forEach(function (k) { if (o[k] != null) { check(type, o, [k]); s[k] = o[k]; } });
          return s;
        };
      }
      var prep = itemStep("prep", v1), work = itemStep("work", v1), rest = itemStep("rest", false), freeItem = itemStep("free", false);
      function free(o) {
        o = o || {};
        if (o.ii != null) return freeItem(o);
        check("free", o, ["pi"]); return { type: "free", pi: o.pi };
      }
      var steps = { gate: gate, prep: prep, work: work, rest: rest, free: free };
      if (v1) steps.block = function (o) { o = o || {}; check("block", o, ["pi", "round"]); return { type: "block", pi: o.pi, round: o.round }; };
      return Object.freeze({ version: version, steps: Object.freeze(steps) });
    }
    var APIS = { v0: make("v0"), v1: make("v1") };
    WP.API_VERSION = "v1";            // la più recente
    WP.steps = APIS.v0.steps;         // costruttori v0 (compatibilità con il codice di T0)
    WP.api = function (version) { return APIS[version || "v0"] || null; };
  }
  defineApi(WP);
  WP.defineApi = defineApi;
  WP.SUPPORTED_APIS = ["v0", "v1"];

  const REP_SET_SEC = 40; // stima di una serie da 10 ripetizioni, solo per la durata prevista
  const GATE_SEC = 45;    // cambio postazione
  const posInt = v => Number.isInteger(v) && v > 0;
  const posNum = v => typeof v === "number" && v > 0;
  const nonNeg = v => typeof v === "number" && v >= 0;

  /* ---------------- v0: regole di T0, invariate ---------------- */

  // una voce che la libreria sa guidare da sola: a tempo con durata, o a ripetizioni con un numero di ripetizioni
  const isGuidedItem = it => !!it && ((it.mode === "timed" && typeof it.dur === "number" && it.dur > 0) ||
    (it.mode === "reps" && typeof it.reps === "number" && it.reps > 0));

  function acceptV0(plan, raw) {
    const S0 = WP.api("v0").steps;
    const problems = [], steps = {};
    const bad = (where, why) => { if (problems.length < 20) problems.push(where + ": " + why); };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { steps: null, problems: ["il risultato non è un oggetto { idSeduta: [passi] }"] };
    Object.keys(raw).forEach(k => { if (!plan.workouts[k]) bad(k, "seduta che non esiste nei dati"); });
    Object.keys(plan.workouts).forEach(k => {
      const w = plan.workouts[k], list = raw[k];
      if (!Array.isArray(list) || !list.length) { bad(k, "mancano i passi della seduta"); return; }
      steps[k] = list.map((s, i) => {
        const at = k + "[" + i + "]";
        if (!s || typeof s !== "object") { bad(at, "non è un passo"); return null; }
        const ph = w.phases[s.pi];
        if (!Number.isInteger(s.pi) || !ph) { bad(at, "pi fuori dalle fasi"); return null; }
        if (s.type === "gate" || (s.type === "free" && s.ii == null)) return s.type === "gate" ? S0.gate({ pi: s.pi }) : S0.free({ pi: s.pi });
        if (!["prep", "work", "rest", "free"].includes(s.type)) { bad(at, "tipo sconosciuto '" + s.type + "'"); return null; }
        const it = ph.items[s.ii];
        if (!Number.isInteger(s.ii) || !it) { bad(at, "ii fuori dalle voci della fase"); return null; }
        if (!posInt(s.sets) || !posInt(s.set) || s.set > s.sets) { bad(at, "serie non valida (" + s.set + " di " + s.sets + ")"); return null; }
        if (posInt(it.sets) && s.sets !== it.sets) { bad(at, "sets = " + s.sets + " ma i dati dicono " + it.sets); return null; }
        if (!Number.isInteger(s.round) || s.round < 0 || s.round > (posInt(ph.rounds) ? ph.rounds : 0)) { bad(at, "giro " + s.round + " fuori da phase.rounds"); return null; }
        if ((s.type === "work" && !isGuidedItem(it)) || (s.type === "prep" && !(it.mode === "timed" && isGuidedItem(it)))) { bad(at, s.type + " su una voce che i dati non permettono di guidare: usa free"); return null; }
        if (s.type === "rest" && !(typeof it.rest === "number" && it.rest > 0)) { bad(at, "riposo su una voce senza rest > 0 nei dati"); return null; }
        return S0[s.type]({ pi: s.pi, ii: s.ii, set: s.set, sets: s.sets, round: s.round });
      });
    });
    return problems.length ? { steps: null, problems } : { steps, problems };
  }

  /* ---------------- v1: componenti nuovi ---------------- */

  const BLOCK_FLOWS = ["emom", "amrap", "fortime"];     // un passo "block" governato dal cronometro del blocco
  const INTERVAL_FLOWS = ["intervals", "tabata"];      // lavoro/recupero × giri, dai numeri della fase
  const ROUND_FLOWS = ["circuit"].concat(INTERVAL_FLOWS);
  // ripetizioni: numero; { min, max } (intervallo "12-15"); { min } ("5+", almeno); "max" (a cedimento / massime)
  const repsOk = r => posInt(r) || r === "max" ||
    (!!r && typeof r === "object" && !Array.isArray(r) && posInt(r.min) && (r.max == null || (posInt(r.max) && r.max > r.min)));
  // tenuta per ripetizione: ripetizioni intere e secondi di tenuta; rilascio facoltativo fra una ripetizione e l'altra
  const holdOk = u => u.hold == null || (posInt(u.reps) && posNum(u.hold) && (u.holdRest == null || nonNeg(u.holdRest)));
  const sidesOk = it => !it.perSide || (Array.isArray(it.sides) && it.sides.length >= 2 && it.sides.every(s => typeof s === "string" && s));

  function blockOk(ph) {
    if (!Array.isArray(ph.items) || !ph.items.length) return false;
    if (ph.flow === "emom") return posInt(ph.every) && posInt(ph.rounds) && (ph.items.length === 1 || ["one", "all"].includes(ph.perInterval));
    if (ph.flow === "amrap") return posInt(ph.time);
    if (ph.flow === "fortime") return (ph.cap == null || posInt(ph.cap)) && (ph.rounds == null || posInt(ph.rounds));
    return false;
  }
  const intervalsOk = ph => posInt(ph.work) && posInt(ph.rounds) && (ph.rest == null || nonNeg(ph.rest)) && Array.isArray(ph.items) && ph.items.length > 0;

  // una voce v1 guidabile dai soli dati (fuori dai blocchi a cronometro, che si guidano come blocco)
  function guidedV1(ph, it) {
    if (!it || !sidesOk(it)) return false;
    if (INTERVAL_FLOWS.includes(ph.flow)) return intervalsOk(ph);
    if (it.mode === "timed") return posNum(it.dur) && !it.parts && !it.drops && it.hold == null;
    if (it.mode !== "reps") return false;
    if (it.parts != null) {
      return Array.isArray(it.parts) && it.parts.length >= 2 && it.reps == null && !it.drops && it.hold == null &&
        it.parts.every(p => p && repsOk(p.reps) && holdOk(p));
    }
    if (!repsOk(it.reps) || !holdOk(it)) return false;
    if (it.drops != null) return Array.isArray(it.drops) && it.drops.length >= 1 && ["all", "last"].includes(it.dropOn) && it.hold == null &&
      it.drops.every(d => d && repsOk(d.reps) && (d.kg == null || posNum(d.kg)));
    return true;
  }

  /* Le parti di una serie (v1): serie composta → le parti dei dati; drop set → serie + scalate (solo sulle serie in ambito);
     altrimenti una parte sola. Ogni parte: { kind: "main" | "part" | "drop", reps, hold, holdRest, text, kg }. */
  function unitsOf(it, set, sets) {
    if (Array.isArray(it.parts)) return it.parts.map(p => ({ kind: "part", reps: p.reps, hold: p.hold, holdRest: p.holdRest, text: p.text }));
    const main = { kind: "main", reps: it.reps, hold: it.hold, holdRest: it.holdRest, dur: it.dur };
    if (Array.isArray(it.drops) && (it.dropOn === "all" || set === sets)) return [main].concat(it.drops.map(d => ({ kind: "drop", reps: d.reps, kg: d.kg })));
    return [main];
  }
  const holdSeconds = u => u.reps * u.hold + (u.reps - 1) * (u.holdRest || 0);
  const unitTimed = (ph, it, u) => INTERVAL_FLOWS.includes(ph.flow) || it.mode === "timed" || (u && u.hold != null);

  // recupero dopo una serie (v1): intervalli → dalla fase; circuito con roundRest → recupero di fine giro sull'ultima voce
  function restSecondsV1(ph, ii, round) {
    if (INTERVAL_FLOWS.includes(ph.flow)) return nonNeg(ph.rest) ? ph.rest : 0;
    const it = ph.items[ii];
    if (ph.flow === "circuit" && Array.isArray(ph.roundRest) && ii === ph.items.length - 1) return nonNeg(ph.roundRest[round - 1]) ? ph.roundRest[round - 1] : 0;
    return posNum(it.rest) ? it.rest : 0;
  }
  // c'è un recupero (a tempo, o "a sensazione" con il testo della scheda e un cronometro in avanti)
  const hasRestV1 = (ph, ii, round) => restSecondsV1(ph, ii, round) > 0 ||
    (!INTERVAL_FLOWS.includes(ph.flow) && !posNum(ph.items[ii].rest) && typeof ph.items[ii].restText === "string" && !!ph.items[ii].restText);

  function acceptV1(plan, raw) {
    const S1 = WP.api("v1").steps;
    const problems = [], steps = {};
    const bad = (where, why) => { if (problems.length < 20) problems.push(where + ": " + why); };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { steps: null, problems: ["il risultato non è un oggetto { idSeduta: [passi] }"] };
    Object.keys(raw).forEach(k => { if (!plan.workouts[k]) bad(k, "seduta che non esiste nei dati"); });
    Object.keys(plan.workouts).forEach(k => {
      const w = plan.workouts[k], list = raw[k];
      if (!Array.isArray(list) || !list.length) { bad(k, "mancano i passi della seduta"); return; }
      steps[k] = list.map((s, i) => {
        const at = k + "[" + i + "]";
        if (!s || typeof s !== "object") { bad(at, "non è un passo"); return null; }
        const ph = w.phases[s.pi];
        if (!Number.isInteger(s.pi) || !ph) { bad(at, "pi fuori dalle fasi"); return null; }
        if (s.type === "gate") return S1.gate({ pi: s.pi });
        if (s.type === "free" && s.ii == null) return S1.free({ pi: s.pi });
        if (s.type === "block") {
          if (!BLOCK_FLOWS.includes(ph.flow) || !blockOk(ph)) { bad(at, "block su una fase che non è un blocco a cronometro valido (EMOM, AMRAP, For Time)"); return null; }
          const okRound = ph.flow === "emom" ? posInt(s.round) && s.round <= ph.rounds : s.round === 0;
          if (!okRound) { bad(at, "giro " + s.round + " non valido per il blocco " + ph.flow); return null; }
          return S1.block({ pi: s.pi, round: s.round });
        }
        if (!["prep", "work", "rest", "free"].includes(s.type)) { bad(at, "tipo sconosciuto '" + s.type + "'"); return null; }
        if (BLOCK_FLOWS.includes(ph.flow) && s.type !== "free") { bad(at, s.type + " dentro un blocco a cronometro: usa block"); return null; }
        const it = ph.items[s.ii];
        if (!Number.isInteger(s.ii) || !it) { bad(at, "ii fuori dalle voci della fase"); return null; }
        if (!posInt(s.sets) || !posInt(s.set) || s.set > s.sets) { bad(at, "serie non valida (" + s.set + " di " + s.sets + ")"); return null; }
        if (posInt(it.sets) && s.sets !== it.sets && !INTERVAL_FLOWS.includes(ph.flow)) { bad(at, "sets = " + s.sets + " ma i dati dicono " + it.sets); return null; }
        const inRounds = ROUND_FLOWS.includes(ph.flow);
        if (!Number.isInteger(s.round) || s.round < 0 || s.round > (posInt(ph.rounds) ? ph.rounds : 0) || (inRounds && posInt(ph.rounds) && s.round < 1)) { bad(at, "giro " + s.round + " fuori da phase.rounds"); return null; }
        const guided = guidedV1(ph, it);
        if (s.type === "rest") {
          if (!hasRestV1(ph, s.ii, s.round)) { bad(at, "riposo dove i dati non ne danno (rest, restText, roundRest o rest della fase)"); return null; }
          return S1.rest({ pi: s.pi, ii: s.ii, set: s.set, sets: s.sets, round: s.round });
        }
        if (s.type === "free") {
          if (s.side != null || s.part != null) { bad(at, "free con side o part: il passo libero è per serie"); return null; }
          return S1.free({ pi: s.pi, ii: s.ii, set: s.set, sets: s.sets, round: s.round });
        }
        if (!guided) { bad(at, s.type + " su una voce che i dati non permettono di guidare: usa free"); return null; }
        // lato: obbligatorio sulle voci per lato, vietato sulle altre
        if (it.perSide ? !(Number.isInteger(s.side) && s.side >= 0 && s.side < it.sides.length) : s.side != null) { bad(at, it.perSide ? "manca side (o fuori da sides) su una voce per lato" : "side su una voce che non è per lato"); return null; }
        const units = unitsOf(it, s.set, s.sets), multi = units.length > 1;
        if (multi ? !(Number.isInteger(s.part) && s.part >= 0 && s.part < units.length) : s.part != null && s.part !== 0) { bad(at, multi ? "manca part (o fuori dalle parti della serie)" : "part su una serie di una parte sola"); return null; }
        const u = units[s.part || 0];
        if (s.type === "prep" && (!unitTimed(ph, it, u) || (s.part || 0) > 0)) { bad(at, "prep su una parte che non è a tempo, o dentro la serie"); return null; }
        const o = { pi: s.pi, ii: s.ii, set: s.set, sets: s.sets, round: s.round };
        if (it.perSide) o.side = s.side;
        if (multi) o.part = s.part;
        return S1[s.type](o);
      });
    });
    return problems.length ? { steps: null, problems } : { steps, problems };
  }

  /* Durata e orologio di un passo: { secs, view }. secs > 0 = conto alla rovescia di secs; 0 = cronometro in avanti.
     view: "down" (conto alla rovescia), "up" (For Time con tetto: il quadrante conta in avanti fino al tetto), "hold"
     (tenuta per ripetizione: il quadrante mostra la ripetizione e la tenuta in corso). v0 = regola di T0. */
  function timing(version, w, st, prepSec) {
    const ph = w.phases[st.pi], it = st.ii != null ? ph.items[st.ii] : null;
    if (version !== "v1") {
      const secs = st.type === "prep" ? prepSec : st.type === "rest" ? it.rest : st.type === "work" && it.mode === "timed" ? it.dur : 0;
      return { secs: secs || 0, view: "down" };
    }
    if (st.type === "prep") return { secs: prepSec, view: "down" };
    if (st.type === "rest") return { secs: restSecondsV1(ph, st.ii, st.round), view: "down" };
    if (st.type === "block") {
      if (ph.flow === "emom") return { secs: ph.every, view: "down" };
      if (ph.flow === "amrap") return { secs: ph.time, view: "down" };
      return { secs: posInt(ph.cap) ? ph.cap : 0, view: "up" };
    }
    if (st.type !== "work") return { secs: 0, view: "down" };
    if (INTERVAL_FLOWS.includes(ph.flow)) return { secs: ph.work, view: "down" };
    if (it.mode === "timed") return { secs: it.dur, view: "down" };
    const u = unitsOf(it, st.set, st.sets)[st.part || 0];
    if (u && u.hold != null) return { secs: holdSeconds(u), view: "hold" };
    return { secs: 0, view: "down" };
  }

  /* Tenuta per ripetizione: dove siamo dopo elapsedMs dall'inizio. { rep, reps, phase: "hold" | "release", leftMs, spanMs } */
  function holdAt(u, elapsedMs) {
    const hold = u.hold * 1000, rel = (u.holdRest || 0) * 1000, cycle = hold + rel;
    const k = Math.min(u.reps - 1, Math.max(0, Math.floor(elapsedMs / cycle)));
    const within = elapsedMs - k * cycle;
    if (within < hold || k === u.reps - 1) return { rep: k + 1, reps: u.reps, phase: "hold", leftMs: Math.max(0, hold - within), spanMs: hold };
    return { rep: k + 1, reps: u.reps, phase: "release", leftMs: Math.max(0, cycle - within), spanMs: rel };
  }

  // passo libero: stima dai soli numeri che i dati hanno (una serie senza durata vale REP_SET_SEC)
  function freeSeconds(ph, it) {
    const one = i => (i.mode === "timed" && typeof i.dur === "number" && i.dur > 0 ? i.dur : REP_SET_SEC);
    if (it) return one(it);
    const count = v => (posInt(v) ? v : 1);
    return count(ph.rounds) * ph.items.reduce((s, i) => s + count(i.sets) * (one(i) + (i.rest > 0 ? i.rest : 0)), 0);
  }

  function estimateMinutes(w, steps, prepSec, version) {
    let sec = 0;
    steps.forEach(st => {
      const ph = w.phases[st.pi], it = st.ii != null ? ph.items[st.ii] : null;
      if (version === "v1" && st.type !== "free" && st.type !== "gate") {
        const t = timing("v1", w, st, prepSec).secs;
        sec += t > 0 ? t : st.type === "block" ? freeSeconds(ph, null) : REP_SET_SEC;
        return;
      }
      if (st.type === "prep") sec += prepSec;
      else if (st.type === "rest") sec += it.rest;
      else if (st.type === "work") sec += it.mode === "timed" ? it.dur : REP_SET_SEC;
      else if (st.type === "free") sec += freeSeconds(ph, it);
      else sec += GATE_SEC; // cambio postazione
    });
    return Math.round(sec / 60 / 5) * 5 || 5;
  }
  // serie e blocchi: passi di lavoro (una volta per serie: le parti e le scalate non contano a sé), passi liberi, blocchi
  const countSets = steps => steps.filter(s => ((s.type === "work" && !s.part) || s.type === "free" || s.type === "block")).length;

  const acceptSteps = (plan, raw) => ((plan.api || "v0") === "v1" ? acceptV1 : acceptV0)(plan, raw);

  WP.isGuidedItem = isGuidedItem;
  WP.acceptSteps = acceptSteps;
  WP.estimateMinutes = estimateMinutes;
  WP.countSets = countSets;
  WP.timing = timing;
  WP.v1 = { BLOCK_FLOWS, INTERVAL_FLOWS, ROUND_FLOWS, repsOk, guided: guidedV1, blockOk, intervalsOk, unitsOf, unitTimed, restSeconds: restSecondsV1, hasRest: hasRestV1, holdAt, holdSeconds };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
