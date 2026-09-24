/* WorkoutPlayer · motore: stato della seduta, timer su orari, pausa e ritocchi, persistenza, annunci, fine e uscita.
   Da src/app2.js:1-23, 67-158 e src/app3.js:91-95. Il disegno sta nei componenti (lib/ui/): il motore li chiama
   attraverso il runtime R (R.render, R.paintClock, R.paintElapsed, R.mountPlayer, R.renderDone, R.renderHome, R.show).

   Timer con scadenza persistita (AC-V3-3, T0 passo 5c). Diverso dall'artifact, che salvava solo seduta, indice e orari:
   - ogni cambio (passo, pausa, ±15 s) salva anche la scadenza (endsAt), la pausa e il residuo, e se la seduta è stata
     lasciata con "Esci" (left) oppure interrotta (ricarica, scheda chiusa, telefono spento);
   - alla riapertura una seduta interrotta riprende da sola nel player sull'orologio: timer in corso con il residuo giusto,
     in pausa con lo stesso residuo, oppure, se è scaduto a pagina chiusa, passo successivo pronto (fermo) con l'avviso
     "Riposo finito da N"; mai più di un passo avanti. Una seduta lasciata con "Esci" resta come nell'artifact: riquadro
     "Seduta in corso" in home e ripresa in pausa;
   - a pagina nascosta (telefono bloccato, altra scheda) il timer non avanza di passo e non suona; al ritorno vale la regola
     della riapertura. Con la pagina chiusa non c'è codice in esecuzione: niente suoni né notifiche.

   Piani v1 (R.v1): la durata e l'orologio di ogni passo vengono da WP.timing (intervalli e recupero di fine giro dalla fase,
   EMOM un intervallo per passo, AMRAP a conto alla rovescia, For Time in avanti fino al tetto, tenuta per ripetizione con
   la ripetizione e la tenuta in corso); i giri contati a mano (AMRAP, For Time) stanno nella seduta salvata (counts).

   T2:
   - voce nella lingua del piano (R.voiceLang, frasi in lib/lang/); le parole dell'interfaccia nella lingua scelta (R.t);
   - ripresa con la sequenza di riserva (AC-L7, seconda metà; decisione di G1): la seduta salvata registra anche il passo
     in cui si era (step: tipo, fase, voce, serie, giro, lato, parte). Se alla riapertura lo script non parte e il player
     usa la riserva, la seduta salvata con lo script riprende dallo stesso passo della riserva (o dal più vicino: stessa
     serie, stessa voce, stessa fase), con un avviso. Il contrario (salvata con la riserva, riaperta con lo script) resta
     escluso come in T0;
   - serie aggiunte e tolte dall'utente (R.features.editSets, AC-P9): modifiche della seduta (edits) applicate alla sequenza
     e salvate con la seduta; esercizi e sedute non si toccano; si aggiunge una serie in fondo alle serie della voce e si
     toglie l'ultima non ancora iniziata, lasciandone almeno una;
   - timer salvato e scheda cambiata (correzione in revisione dopo il salvataggio, difetto del 24/09): la seduta salvata registra
     anche la durata del passo nella scheda (timer.secs); se alla riapertura la scheda dà un'altra durata, il timer salvato non
     vale più e il passo riparte da capo, fermo, con la durata nuova (le sedute salvate prima, senza secs, riprendono come prima);
   - durata a intervallo ({ min, max }, dalla revisione): conto alla rovescia sul massimo, bip e voce quando il minimo è
     raggiunto ("puoi fermarti"), poi avanti da solo al massimo come ogni lavoro a tempo;
   - diario locale per serie (R.features.diary): a ogni passo di lavoro lasciato in avanti si registra la serie (carico
     usato, ripetizioni fatte, durata, serie aggiunta); a fine seduta il diario della seduta va in S.diary (ultime 30). */
(function (WP) {
  "use strict";
  const DIARY_MAX = 30;
  const EDITABLE_FLOWS = [undefined, "sets", "continuous"];
  WP.modules.session = function (R) {
    const S = R.S, store = R.store, EX = R.EX;
    const { fmt } = WP.util;
    let ticker = null;
    const AWAY_MS = 2000; // scaduto da più di così: il passo è finito mentre la pagina era nascosta o ferma
    R.W = null; R.STEPS = []; R.cur = null;
    // R.cur = { wid, idx, startedAt, stepAt, endsAt, remaining, total, secs, paused, lastSec, view, seg, counts, edits, log, repsDone }
    const VL = () => R.voiceLang || R.lang;           // lingua della voce
    const tv = (key, p) => WP.i18n.t(VL(), key, p);    // frase della voce
    const vLabel = st => R.setLabel(st, VL());
    const vKg = v => R.fmtKg(v, VL());

    const phaseOf = st => R.W.phases[st.pi];
    const itemOf = st => (st.ii != null ? R.W.phases[st.pi].items[st.ii] : null);
    const nextWork = from => {
      for (let i = from + 1; i < R.STEPS.length; i++) { const t = R.STEPS[i].type; if (t === "work" || t === "gate" || t === "free" || t === "block") return R.STEPS[i]; }
      return null;
    };
    const estimateMinutes = w => WP.estimateMinutes(w, R.buildSteps(w), S.settings.prep, R.version);
    const countSets = w => WP.countSets(R.buildSteps(w));

    /* ---- serie aggiunte e tolte (T2, AC-P9) ---- */
    const groupsOf = (steps, pi, ii) => { // serie della voce → indici dei suoi passi, nell'ordine
      const g = new Map();
      steps.forEach((s, i) => { if (s.pi === pi && s.ii === ii && s.type !== "gate") { if (!g.has(s.set)) g.set(s.set, []); g.get(s.set).push(i); } });
      return g;
    };
    const retotal = (steps, pi, ii) => { const n = groupsOf(steps, pi, ii).size; return steps.map(s => (s.pi === pi && s.ii === ii && s.type !== "gate" ? Object.assign({}, s, { sets: n }) : s)); };
    function applyEdit(w, steps, e) {
      const ph = w.phases[e.pi], it = ph && ph.items[e.ii];
      if (!it || !EDITABLE_FLOWS.includes(ph.flow)) return steps;
      const g = groupsOf(steps, e.pi, e.ii), sets = [...g.keys()].sort((a, b) => a - b), last = sets[sets.length - 1];
      if (last == null) return steps;
      const idx = g.get(last), out = steps.slice(), endsWithRest = steps[idx[idx.length - 1]].type === "rest";
      if (e.type === "add") {
        const clones = idx.map(i => Object.assign({}, steps[i], { set: last + 1, extra: true }));
        const restOk = R.v1 ? WP.v1.hasRest(ph, e.ii, steps[idx[0]].round || 1) : it.rest > 0;
        const lead = !endsWithRest && restOk ? [{ type: "rest", pi: e.pi, ii: e.ii, set: last, sets: steps[idx[0]].sets, round: steps[idx[0]].round }] : [];
        out.splice(idx[idx.length - 1] + 1, 0, ...lead, ...clones);
      } else if (e.type === "remove") {
        if (sets.length < 2 || e.set !== last) return steps;
        let from = idx[0];
        const before = steps[from - 1];
        if (!endsWithRest && before && before.type === "rest" && before.pi === e.pi && before.ii === e.ii) from--; // il recupero che portava alla serie tolta
        out.splice(from, idx[idx.length - 1] + 1 - from);
      } else return steps;
      return retotal(out, e.pi, e.ii);
    }
    const stepsFor = (w, edits) => (edits || []).reduce((steps, e) => applyEdit(w, steps, e), R.buildSteps(w));
    // si può togliere l'ultima serie della voce se non è ancora iniziata e ne resta almeno una
    function canRemoveSet(pi, ii) {
      const g = groupsOf(R.STEPS, pi, ii), sets = [...g.keys()].sort((a, b) => a - b);
      return sets.length > 1 && g.get(sets[sets.length - 1])[0] > R.cur.idx;
    }
    function editSets(delta) {
      const cur = R.cur, st = R.STEPS[cur.idx];
      if (!R.features.editSets || !st || st.type !== "work" || !EDITABLE_FLOWS.includes(phaseOf(st).flow)) return;
      const e = { type: delta > 0 ? "add" : "remove", pi: st.pi, ii: st.ii };
      if (e.type === "remove") {
        if (!canRemoveSet(st.pi, st.ii)) return;
        e.set = Math.max(...groupsOf(R.STEPS, st.pi, st.ii).keys());
      }
      cur.edits = (cur.edits || []).concat([e]);
      R.STEPS = applyEdit(R.W, R.STEPS, e);
      persist(); R.mountPlayer(); R.render();
    }

    /* ---- diario per serie (T2) ---- */
    // ripetizioni fatte mostrate nel passo corrente: quelle toccate dall'utente, altrimenti quelle della scheda (intervallo: il minimo)
    function plannedReps(st) {
      const it = itemOf(st); if (!it) return null;
      const r = R.v1 ? (R.unitOf(st) || {}).reps : it.reps;
      return typeof r === "number" ? r : r && typeof r === "object" && Number.isInteger(r.min) ? r.min : null;
    }
    const repsDone = () => (R.cur.repsDone != null ? R.cur.repsDone : plannedReps(R.STEPS[R.cur.idx]));
    function changeReps(delta) {
      const n = repsDone();
      R.cur.repsDone = Math.max(0, (n == null ? 0 : n) + delta);
      persist(); R.render();
    }
    function logStep(i) {
      const cur = R.cur, st = R.STEPS[i];
      if (!st || !["work", "block", "free"].includes(st.type)) return;
      const it = itemOf(st), e = { type: st.type, pi: st.pi, ii: st.ii, set: st.set, sets: st.sets, round: st.round, at: Date.now() };
      if (st.side != null) e.side = st.side;
      if (st.part != null) e.part = st.part;
      if (st.extra) e.extra = true;
      if (it) e.ex = it.ex;
      if (st.type === "work" && it) {
        const tm = WP.timing(R.version, R.W, st, S.settings.prep), u = R.v1 ? R.unitOf(st) : null;
        if (tm.secs && tm.view !== "hold") e.secs = tm.secs;
        else { e.reps = repsDone(); e.repsPlan = u ? u.reps : it.reps; if (u && u.hold != null) e.hold = u.hold; }
        const kg = u && u.kind === "drop" ? u.kg : R.kgOf(it);
        if (typeof kg === "number") { e.kg = kg; e.kgPlan = u && u.kind === "drop" ? u.kg : it.kg; }
      }
      if (st.type === "block" && cur.counts && cur.counts[i] != null) e.rounds = cur.counts[i];
      cur.log = cur.log || {};
      cur.log[[st.pi, st.ii, st.set, st.round, st.side, st.part, st.type === "block" ? i : ""].join(".")] = e;
    }

    const stepDesc = st => { const d = {}; ["type", "pi", "ii", "set", "round", "side", "part"].forEach(k => { if (st[k] != null) d[k] = st[k]; }); return d; };
    function persist(left) {
      const cur = R.cur;
      S.session = cur ? {
        wid: cur.wid, idx: cur.idx, startedAt: cur.startedAt, savedAt: Date.now(),
        seq: R.mode, left: !!left, stepAt: cur.stepAt,
        timer: cur.endsAt == null ? null : { endsAt: cur.endsAt, total: cur.total, paused: !!cur.paused, remaining: cur.paused ? cur.remaining : null, secs: cur.secs }
      } : null;
      if (cur && cur.counts) S.session.counts = cur.counts;
      if (cur && R.STEPS[cur.idx]) S.session.step = stepDesc(R.STEPS[cur.idx]);
      if (cur && cur.edits && cur.edits.length) S.session.edits = cur.edits;
      if (cur && cur.log) S.session.log = cur.log;
      if (cur && cur.repsDone != null) S.session.repsDone = cur.repsDone;
      store.save();
    }
    // la seduta salvata si può riprendere con questa sequenza (le sedute salvate dall'artifact non hanno seq: sono dello script);
    // una seduta dello script si riprende anche con la riserva, se ha salvato il passo in cui era (T2, AC-L7)
    const sameSeq = ses => (ses.seq || "script") === R.mode;
    const resumable = ses => !!ses && !!R.WORKOUTS[ses.wid] && Date.now() - ses.savedAt < 6 * 36e5 &&
      (sameSeq(ses) || (R.mode === "riserva" && (ses.seq || "script") === "script" && !!ses.step));
    // dove riprendere nella sequenza di adesso: { idx, exact } (exact = stesso passo, il timer salvato vale)
    function locate(ses, steps) {
      if (sameSeq(ses)) return { idx: Math.min(ses.idx, steps.length - 1), exact: true };
      const d = ses.step, same = (s, keys) => keys.every(k => (s[k] == null ? null : s[k]) === (d[k] == null ? null : d[k]));
      let i = steps.findIndex(s => same(s, ["type", "pi", "ii", "set", "round", "side", "part"]));
      if (i >= 0) return { idx: i, exact: true };
      const tries = [s => same(s, ["pi", "ii", "set", "round"]) && s.type !== "rest", s => d.ii != null && same(s, ["pi", "ii"]) && s.type !== "rest",
        s => s.pi === d.pi && s.type !== "gate", s => s.pi === d.pi];
      for (const f of tries) { i = steps.findIndex(f); if (i >= 0) return { idx: i, exact: false }; }
      return { idx: 0, exact: false };
    }
    const sessionSteps = ses => stepsFor(R.WORKOUTS[ses.wid], ses.edits);

    function begin(id, startedAt, counts, edits, log) {
      R.W = R.WORKOUTS[id]; R.STEPS = stepsFor(R.W, edits);
      R.cur = { wid: id, idx: 0, startedAt: startedAt || Date.now() };
      if (counts) R.cur.counts = counts;
      if (edits && edits.length) R.cur.edits = edits;
      if (log) R.cur.log = log;
      R.mountPlayer(); R.keepAwake(true);
      clearInterval(ticker); ticker = setInterval(tick, 200);
    }
    // ses: la seduta salvata da cui si riparte (riquadro "Seduta in corso"), per le serie modificate, il diario e la sequenza
    function startWorkout(id, idx, startedAt, counts, ses) {
      const other = !!ses && !sameSeq(ses);
      begin(id, startedAt, idx > 0 && !other ? counts : null, ses && ses.edits, ses && ses.log);
      enter(Math.min(idx || 0, R.STEPS.length - 1), { resumed: idx > 0, fallback: other });
    }

    // seduta interrotta senza "Esci": si rientra nel player sull'orologio (AC-V3-3)
    function resumeInterrupted() {
      const ses = S.session;
      if (!resumable(ses) || ses.left !== false) return false;
      const other = !sameSeq(ses);
      begin(ses.wid, ses.startedAt, other ? null : ses.counts, ses.edits, ses.log);
      const loc = locate(ses, R.STEPS), t = ses.timer;
      if (t && !t.paused && t.endsAt <= Date.now() && loc.exact) awayExpired(loc.idx, t.endsAt, other);
      else enter(loc.idx, loc.exact ? { restore: ses, fallback: other } : { resumed: true, fallback: other });
      return true;
    }
    // passo a tempo scaduto mentre la pagina era chiusa o nascosta: passo successivo pronto, fermo, con l'avviso
    function awayExpired(idx, endsAt, fallback) {
      const st = R.STEPS[idx], sec = Math.max(1, Math.floor((Date.now() - endsAt) / 1000));
      const key = st.type === "rest" ? "away.rest" : st.type === "prep" ? "away.prep" : st.type === "block" ? "away.block" : "away.work";
      const notice = R.t(key, { t: sec < 60 ? sec + " s" : Math.floor(sec / 60) + " min" });
      if (idx + 1 >= R.STEPS.length) return finish();
      enter(idx + 1, { resumed: true, notice, fallback });
    }

    function enter(idx, opt) {
      opt = opt || {};
      const STEPS = R.STEPS, cur = R.cur;
      if (R.features.diary && cur.idx != null && idx === cur.idx + 1 && !opt.back && !opt.restore && !opt.resumed) logStep(cur.idx);
      if (idx >= STEPS.length) return finish();
      idx = Math.max(0, idx);
      const st = STEPS[idx], it = itemOf(st);
      if (st.type === "prep" && !S.settings.prep) return enter(idx + (opt.back ? -1 : 1), opt);
      cur.repsDone = opt.restore && opt.restore.repsDone != null ? opt.restore.repsDone : null;
      cur.idx = idx; cur.stepAt = Date.now(); cur.paused = false; cur.lastSec = null; cur.endsAt = null; cur.total = 0; cur.seg = null;
      const tm = WP.timing(R.version, R.W, st, S.settings.prep), secs = tm.secs;
      cur.secs = secs || 0; // durata del passo nella scheda (il timer salvato vale solo finché è questa)
      cur.view = tm.view;
      // durata a intervallo (T2): il minimo è raggiunto quando restano (massimo − minimo) secondi
      cur.rangeLeftMs = tm.min ? (secs - tm.min) * 1000 : null; cur.minDone = false;
      if (secs) {
        cur.total = secs * 1000; cur.endsAt = Date.now() + cur.total;
        if (opt.resumed) { cur.paused = true; cur.remaining = cur.total; }
      }
      const t = opt.restore && opt.restore.timer;
      if (t && cur.endsAt != null && t.secs != null && t.secs !== cur.secs) { cur.paused = true; cur.remaining = cur.total; } // la scheda è cambiata: da capo, fermo
      else if (t && cur.endsAt != null) { // ripresa sull'orologio: stessa scadenza, oppure stessa pausa con lo stesso residuo
        cur.total = t.total;
        if (t.paused) { cur.paused = true; cur.remaining = t.remaining; } else { cur.paused = false; cur.endsAt = t.endsAt; }
      } else if (opt.restore && cur.endsAt == null && opt.restore.stepAt) cur.stepAt = opt.restore.stepAt;
      cur.notice = opt.notice || null;
      cur.fallbackNotice = opt.fallback ? R.t("resume.fallback") : null;
      persist(); R.render(); R.scrollTop();
      if (opt.resumed || opt.restore) return;
      if (R.v1) announceV1(st, it, opt); else announce(st, it, opt);
    }

    // durate dette a voce, regola di T0 (piani v0): "45 secondi", "2 minuti", "1:30 minuti"
    const spokenDurV0 = sec => (sec < 60 ? tv("voice.secs", { n: sec }) : tv("voice.mins", { n: sec % 60 ? fmt(sec) : sec / 60 }));
    const rpeSay = label => label.replace("RPE", "R P E");
    function announce(st, it, opt) {
      const ex = it ? EX[it.ex] : null, say = R.say, sfx = R.sfx;
      if (st.type === "prep") say(tv("voice.prep") + " " + ex.it + ". " + (vLabel(st) ? vLabel(st) + ". " : "") + spokenDurV0(it.dur) + ".");
      else if (st.type === "work") {
        if (it.mode === "timed") { sfx.go(); say(tv("voice.go") + " " + (it.label && /^RPE/.test(it.label) ? ex.it + ", " + rpeSay(it.label) + "." : "")); }
        else { if (opt.auto) sfx.go(); say(ex.it + ". " + vLabel(st) + ". " + tv("voice.reps", { n: it.reps }) + (typeof R.kgOf(it) === "number" ? ", " + tv("voice.kg", { kg: vKg(R.kgOf(it)) }) + "." : ".")); }
      } else if (st.type === "rest") {
        sfx.rest(); const n = nextWork(R.cur.idx), ni = n && itemOf(n);
        say(tv("voice.restSecs", { n: it.rest }) + (ni ? " " + tv("voice.then", { what: EX[ni.ex].it + (ni === it ? ", " + vLabel(n).split(" · ").join(", ") : "") }) : ""));
      } else if (st.type === "free") {
        if (opt.auto) sfx.go();
        say(tv("voice.follow", { what: it ? ex.it + (vLabel(st) ? ". " + vLabel(st) : "") : phaseOf(st).title }));
      }
    }

    // durate dette a voce (v1): "30 secondi", "1 minuto", "2 minuti", "1:30 minuti"
    const spokenOne = sec => (sec < 60 ? tv("voice.secs", { n: sec }) : sec % 60 ? tv("voice.mins", { n: fmt(sec) }) : sec === 60 ? tv("voice.min1") : tv("voice.mins", { n: sec / 60 }));
    const spokenDur = sec => (sec && typeof sec === "object" ? tv("voice.durRange", { min: spokenOne(sec.min), max: spokenOne(sec.max) }) : spokenOne(sec));
    const repsSay = r => R.repsVoice(r, VL());
    function announceV1(st, it, opt) {
      const say = R.say, sfx = R.sfx, ph = phaseOf(st), ex = it ? EX[it.ex] : null, name = R.exName(ex);
      const label = it || st.type === "block" ? vLabel(st).split(" · ").join(", ") : "", u = it ? R.unitOf(st) : null, V = WP.v1;
      const kgSay = (typeof R.kgOf(it || {}) === "number" ? ", " + tv("voice.kg", { kg: vKg(R.kgOf(it)) }) + "." : ".");
      if (st.type === "prep") {
        const what = V.INTERVAL_FLOWS.includes(ph.flow) ? spokenDur(ph.work) : u && u.hold != null ? repsSay(u.reps) + ", " + tv("voice.hold", { d: spokenDur(u.hold) }) : spokenDur(it.dur);
        say(tv("voice.prep") + " " + name + ". " + (label ? label + ". " : "") + what + ".");
      } else if (st.type === "work") {
        const t = WP.timing("v1", R.W, st, S.settings.prep);
        if (V.INTERVAL_FLOWS.includes(ph.flow)) { sfx.go(); say(tv("voice.go") + " " + name + "."); }
        else if (it.mode === "timed") { sfx.go(); say(tv("voice.go") + " " + (it.perSide && st.side != null ? it.sides[st.side] + ". " : "") + (it.label && /^RPE/.test(it.label) ? name + ", " + rpeSay(it.label) + "." : "")); }
        else if (t.view === "hold") { sfx.go(); say(name + ". " + (label ? label + ". " : "") + repsSay(u.reps) + ", " + tv("voice.hold", { d: spokenDur(u.hold) }) + ". " + tv("voice.holdGo")); }
        else if (u.kind === "drop") { sfx.go(); say(tv("voice.drop") + (typeof u.kg === "number" ? " " + tv("voice.dropTo", { kg: vKg(u.kg) }) : "") + ". " + repsSay(u.reps) + "."); }
        else if (u.kind === "part" && st.part > 0) { sfx.go(); say(tv("voice.now", { what: repsSay(u.reps) + (u.text ? ", " + u.text : "") })); }
        else { if (opt.auto) sfx.go(); say(name + ". " + (label ? label + ". " : "") + repsSay(u.reps) + (u.text ? ", " + u.text : "") + kgSay); }
      } else if (st.type === "rest") {
        sfx.rest(); const n = nextWork(R.cur.idx), ni = n && itemOf(n), secs = WP.timing("v1", R.W, st, S.settings.prep).secs;
        say((secs ? tv("voice.restSecs", { n: secs }) : tv("voice.restText", { text: it.restText || tv("voice.byFeel") })) +
          (ni ? " " + tv("voice.then", { what: R.exName(EX[ni.ex]) + (ni === it ? ", " + vLabel(n).split(" · ").join(", ") : "") }) : ""));
      } else if (st.type === "block") {
        sfx.go();
        if (ph.flow === "emom") say(label + ". " + blockItems(st).map(i => R.exName(EX[i.ex]) + (i.reps != null ? ", " + repsSay(i.reps) : i.mode === "timed" && typeof i.dur === "number" ? ", " + spokenDur(i.dur) : "")).join(". ") + ".");
        else if (ph.flow === "amrap") say(tv("voice.amrap", { d: spokenDur(ph.time) }));
        else say(tv("voice.forTime"));
      } else if (st.type === "free") {
        if (opt.auto) sfx.go();
        say(tv("voice.follow", { what: it ? name + (label ? ". " + label : "") : ph.title }));
      }
    }
    // le voci da fare in un passo "block": EMOM a rotazione = una voce per intervallo; altrimenti tutte
    const blockItems = st => { const ph = phaseOf(st); return ph.flow === "emom" && ph.perInterval === "one" && ph.items.length > 1 ? [ph.items[(st.round - 1) % ph.items.length]] : ph.items; };
    // un giro in più contato a mano (AMRAP, For Time): resta nella seduta salvata
    function addRound() {
      const cur = R.cur; if (!cur) return;
      cur.counts = cur.counts || {};
      const n = (cur.counts[cur.idx] || 0) + 1;
      cur.counts[cur.idx] = n; persist(); R.say(tv("voice.round", { n })); R.render();
    }

    function remainingMs() { const cur = R.cur; return cur.endsAt == null ? 0 : cur.paused ? cur.remaining : cur.endsAt - Date.now(); }

    function tick() {
      const cur = R.cur;
      if (!cur || R.playerHidden() || R.pageHidden()) return; // a pagina nascosta niente passi avanti né suoni
      const st = R.STEPS[cur.idx];
      if (cur.endsAt == null) { // serie a ripetizioni, passo libero o cambio fase: cronometro in avanti
        R.paintElapsed((Date.now() - cur.stepAt) / 1000);
        return;
      }
      const ms = remainingMs(), sec = Math.ceil(ms / 1000);
      if (!cur.paused && ms <= 0) return ms < -AWAY_MS ? awayExpired(cur.idx, cur.endsAt) : enter(cur.idx + 1, { auto: true });
      if (cur.rangeLeftMs != null && !cur.paused && ms <= cur.rangeLeftMs && !cur.minDone) { // durata a intervallo: minimo raggiunto
        cur.minDone = true;
        if (cur.lastSec != null) { R.sfx.go(); R.say(tv("voice.minDone")); }
      }
      if (cur.view === "hold") { // tenuta per ripetizione: un bip a ogni tenuta che parte, uno a ogni rilascio
        const h = WP.v1.holdAt(R.unitOf(st), cur.total - ms), key = h.rep + h.phase;
        if (key !== cur.seg) {
          if (cur.seg != null && !cur.paused) { if (h.phase === "hold") { R.sfx.go(); R.say(String(h.rep)); } else R.sfx.tick(); }
          cur.seg = key; cur.lastSec = null;
        }
        if (sec !== cur.lastSec) { cur.lastSec = sec; R.paintClock(ms); }
        return;
      }
      if (sec !== cur.lastSec) {
        if (!cur.paused && cur.lastSec != null) {
          const long = st.type === "work" || st.type === "block";
          if (sec <= 3 && sec >= 1) R.sfx.tick();
          if (long && cur.total >= 3e5 && sec % 300 === 0 && sec > 0) R.say(tv("voice.minsLeft", { n: sec / 60 }));
          if (long && cur.total >= 9e4 && sec === 30) R.say(tv("voice.last30"));
          if (st.type === "rest" && cur.total >= 45e3 && sec === 10) R.say(tv("voice.ten"));
        }
        cur.lastSec = sec; R.paintClock(ms);
      }
    }

    function togglePause() {
      const cur = R.cur;
      if (cur.endsAt == null) return;
      if (cur.paused) { cur.endsAt = Date.now() + cur.remaining; cur.paused = false; R.unlockAudio(); }
      else { cur.remaining = remainingMs(); cur.paused = true; R.hush(); }
      persist(); R.render();
    }
    function adjust(delta) {
      const cur = R.cur;
      if (cur.endsAt == null) return;
      if (cur.paused) cur.remaining = Math.max(1000, cur.remaining + delta * 1000);
      else cur.endsAt = Math.max(Date.now() + 1000, cur.endsAt + delta * 1000);
      cur.total = Math.max(cur.total, remainingMs()); cur.lastSec = null;
      persist();
    }

    function finish() {
      const W = R.W, cur = R.cur;
      const mins = Math.max(1, Math.round((Date.now() - cur.startedAt) / 6e4));
      R.lastLog = null;
      if (R.features.diary) { // il diario della seduta: in memoria su questo dispositivo, ultime DIARY_MAX sedute per piano
        const entry = { wid: W.id, startedAt: cur.startedAt, endedAt: Date.now(), mins, seq: R.mode, sets: Object.values(cur.log || {}), edits: cur.edits || [] };
        S.diary = [entry].concat(Array.isArray(S.diary) ? S.diary : []).slice(0, DIARY_MAX);
        R.lastLog = entry;
      }
      S.last[W.id] = Date.now(); R.cur = null; persist();
      clearInterval(ticker); R.keepAwake(false);
      R.sfx.done(); R.say(tv("voice.done"));
      R.renderDone(mins);
    }

    function leave() {
      clearInterval(ticker); R.keepAwake(false); R.hush();
      if (R.cur) persist(true);
      R.cur = null; R.renderHome(); R.show("home");
    }

    return { phaseOf, itemOf, nextWork, blockItems, estimateMinutes, countSets, persist, resumable, locate, sessionSteps, startWorkout, resumeInterrupted, enter, announce, addRound, remainingMs, tick, togglePause, adjust, finish, leave,
      canRemoveSet, editSets, repsDone, changeReps };
  };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
