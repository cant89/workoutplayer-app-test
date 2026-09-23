/* WorkoutPlayer · componente: il player (barra in alto, avanzamento per fase, disegno del passo corrente).
   Passi: ingresso di fase (gate), preparazione, lavoro a tempo con quadrante, lavoro a ripetizioni con "Serie completata",
   riposo con "Tra poco", passo libero (free). Da src/app2.js:127-134 e src/app3.js:1-73.
   Dai dati: nota di giro dei circuiti (phase.roundNote), obiettivo dei battiti nelle fasi con hr.
   Avviso "Mentre eri via" quando un passo a tempo è finito a pagina chiusa o nascosta (R.cur.notice, AC-V3-3).
   Piani v1 (R.v1), in più: lato della voce per lato, scalata del drop set ("Scala il carico", senza riposo), parti della
   serie composta, tenuta per ripetizione (quadrante con ripetizione e tenuta in corso), ripetizioni a intervallo /
   almeno / max, intervalli e Tabata (giro, lavoro e recupero della fase), blocchi a cronometro (passo "block": EMOM un
   intervallo per passo, AMRAP a conto alla rovescia con i giri contati a mano, For Time in avanti fino al tetto),
   recupero "a sensazione" con cronometro in avanti, prescrizioni aperte (rx) come testo accanto ai numeri.
   Un campo facoltativo assente non mostra nulla.
   T2: tutte le parole dell'interfaccia vengono da lib/lang/ nella lingua scelta (R.t). Con le opzioni dell'app, in più:
   ripetizioni fatte per il diario (R.features.diary), "aggiungi / togli una serie" con le serie marcate
   (R.features.editSets, AC-P9), valori confermati o corretti in revisione (R.marks, AC-R4), avviso di ripresa con la
   sequenza di riserva (R.cur.fallbackNotice, AC-L7). Senza opzioni il disegno è quello di T1 (parità con l'artifact). */
(function (WP) {
  "use strict";
  const CIRC = 2 * Math.PI * 135;
  const EDITABLE_FLOWS = [undefined, "sets", "continuous"];
  WP.modules.player = function (R) {
    const { $, esc, fmt, durText } = WP.util;
    const S = R.S, EX = R.EX, IMG = R.IMG, V = WP.v1, T = R.t;
    const fmtKg = v => R.fmtKg(v);

    const ring = '<svg viewBox="0 0 300 300" aria-hidden="true"><circle class="bg" cx="150" cy="150" r="135"/><circle class="fg" id="ring" cx="150" cy="150" r="135" stroke-dasharray="' + CIRC + '" stroke-dashoffset="0"/></svg>';
    // kind "reps" e "free" disegnano il quadrante a ripetizioni e il cronometro; qualunque altro valore è la scritta sotto il conto alla rovescia
    function dialHTML(kind, it) {
      if (kind === "reps") return '<div class="dial">' + ring + '<div class="mid"><span class="big num">' + it.reps + '</span><span class="sub">' + T("dial.reps") + '</span><span class="sub2" id="elapsed">0:00</span></div></div>';
      if (kind === "free") return '<div class="dial">' + ring + '<div class="mid"><span class="big num" id="elapsed">0:00</span><span class="sub">' + T("dial.elapsed") + "</span></div></div>";
      return '<div class="dial">' + ring + '<div class="mid"><span class="big num" id="big" role="timer"></span><span class="sub">' + (R.cur.paused ? T("dial.paused") : kind) + "</span></div></div>";
    }
    // v1: ripetizioni come testo ("12-15", "5+", "max"), tenuta con la ripetizione in corso
    const repsDialHTML = r => '<div class="dial">' + ring + '<div class="mid"><span class="big num">' + esc(r === "max" ? T("dial.max") : R.repsText(r)) +
      '</span><span class="sub">' + (r === "max" ? T("dial.asManyAs") : r && typeof r === "object" && r.max == null ? T("dial.repsOrMore") : T("dial.reps")) + '</span><span class="sub2" id="elapsed">0:00</span></div></div>';
    const holdDialHTML = () => '<div class="dial">' + ring + '<div class="mid"><span class="big num" id="big" role="timer"></span><span class="sub" id="holdSub">' + (R.cur.paused ? T("dial.paused") : "") + "</span></div></div>";
    const pauseLabel = () => (R.cur.paused ? T("btn.resume") : T("btn.pause"));
    const adjustHTML = () => '<div class="adjust"><button type="button" data-adj="-15">−15 s</button><button type="button" data-act="pause">' + pauseLabel() + '</button><button type="button" data-adj="15">+15 s</button></div>';
    const pauseHTML = () => '<div class="adjust"><button type="button" data-act="pause">' + pauseLabel() + "</button></div>";
    const noteHTML = t => (t ? '<div class="note"><span class="eyebrow">' + T("note.trainer") + "</span>" + esc(t) + "</div>" : "");
    const chip = (label, value) => '<div class="chip"><span>' + esc(label) + "</span><b>" + esc(value) + "</b></div>";
    // "Serie 1 di 4 · Lato sinistro" → [Serie 1/4] [Lato sinistro]; info = R.setInfo(st) o R.partInfo(st)
    const infoChips = info => {
      if (!info || !info.kind) return "";
      return chip(T("chip." + info.kind), info.n + "/" + info.of) + (info.side ? chip(T("chip.side"), R.sideValue(info.side)) : "");
    };
    function kgChipHTML(it) {
      if (typeof it.kg === "number") {
        const changed = S.kg[it.ex] != null && S.kg[it.ex] !== it.kg;
        return '<div class="chip kg"><span>' + T("chip.load") + '</span><div class="kgrow"><button type="button" data-kg="-1" data-ex="' + it.ex + '" aria-label="' + T("aria.kgDown") + '">−</button><b>' + fmtKg(R.kgOf(it)) + ' kg</b><button type="button" data-kg="1" data-ex="' + it.ex + '" aria-label="' + T("aria.kgUp") + '">+</button></div>' +
          (changed ? "<small>" + T("kg.inPlan", { kg: fmtKg(it.kg) }) + "</small>" : "") + "</div>";
      }
      return '<div class="chip"><span>' + T("chip.load") + "</span><b>" + (it.kg === "BW" ? T("kg.bwShort") : T("kg.freeShort")) + "</b></div>";
    }
    const hrValue = () => (R.bpm() ? "≈ " + R.bpm() + " bpm" : T("hr.target"));
    function chipsHTML(it, st, withRest) {
      if (R.v1) return chipsHTMLV1(it, st, withRest);
      let h = '<div class="chips">' + infoChips(R.setInfo(st));
      if (it.mode === "reps") {
        h += chip(T("chip.reps"), it.reps);
        h += kgChipHTML(it);
      } else {
        h += chip(T("chip.duration"), durText(it.dur));
        if (it.label && /^RPE/.test(it.label)) h += chip(T("chip.effort"), it.label);
        if (R.phaseOf(st).hr) h += chip(T("chip.target"), hrValue());
      }
      if (withRest && it.rest) h += chip(T("chip.rest"), durText(it.rest));
      return h + "</div>";
    }
    function chipsHTMLV1(it, st, withRest) {
      const ph = R.phaseOf(st), u = R.unitOf(st) || { kind: "main", reps: it.reps };
      let h = '<div class="chips">' + infoChips(R.setInfo(st)) + infoChips(R.partInfo(st));
      if (V.INTERVAL_FLOWS.includes(ph.flow)) {
        h += chip(T("chip.work"), durText(ph.work));
        if (withRest && ph.rest) h += chip(T("chip.rest"), durText(ph.rest));
      } else if (it.mode === "timed") {
        h += chip(T("chip.duration"), durText(it.dur) + (it.perSide ? " " + T("sum.perSide") : ""));
        if (it.label && /^RPE/.test(it.label)) h += chip(T("chip.effort"), it.label);
      } else {
        h += chip(T("chip.reps"), R.repsText(u.reps));
        if (u.hold != null) h += chip(T("chip.hold"), durText(u.hold)) + (u.holdRest ? chip(T("chip.release"), durText(u.holdRest)) : "");
        if (u.kind === "drop") h += chip(T("chip.load"), typeof u.kg === "number" ? fmtKg(u.kg) + " kg" : T("kg.lighter"));
        else if (!(u.hold != null && it.kg == null)) h += kgChipHTML(it); // una tenuta senza carico nei dati: nessun riquadro del carico
      }
      if (ph.hr) h += chip(T("chip.target"), hrValue());
      const units = V.unitsOf(it, st.set, st.sets);
      const endOfSet = (st.part == null || st.part === units.length - 1) && (!it.perSide || st.side == null || st.side === it.sides.length - 1);
      if (withRest && endOfSet && !V.INTERVAL_FLOWS.includes(ph.flow)) {
        const secs = V.restSeconds(ph, st.ii, st.round || 1);
        if (secs) h += chip(T("chip.rest"), durText(secs));
        else if (it.restText && !(typeof it.rest === "number" && it.rest > 0)) h += chip(T("chip.rest"), it.restText);
      }
      if (R.rxText(it)) h += it.rx.filter(x => typeof x === "string" && x).map(x => chip(T("chip.asWritten"), x)).join(""); // prescrizioni aperte, come testo
      return h + "</div>";
    }
    function exerciseHTML(it, full) {
      const ex = EX[it.ex], src = IMG[ex.img || it.ex], how = Array.isArray(ex.how) ? ex.how : [];
      const cue = it.cue ? (it.label ? it.label + " = " + it.cue : it.cue) : "";
      return (cue ? '<p class="gear">' + esc(cue) + "</p>" : "") + noteHTML(it.note) +
        (src ? '<div class="figure"><img alt="' + esc(T("alt.figure", { name: R.exName(ex) })) + '" src="' + src + '" width="600" height="300"></div>' : "") +
        (full && (how.length || ex.gear) ? '<div class="how">' + (how.length ? '<span class="eyebrow">' + T("how.title") + "</span><ol>" + how.map(s => "<li>" + esc(s) + "</li>").join("") + "</ol>" : "") +
          (ex.gear ? '<p class="gear">' + esc(T("how.gear", { gear: ex.gear })) + "</p>" : "") + "</div>" : "");
    }
    const titleHTML = (h, p) => '<div class="title"><h2>' + esc(h) + "</h2>" + (p ? "<p>" + esc(p) + "</p>" : "") + "</div>";
    const phaseNotesHTML = ph => ((ph.notes || []).length ? '<div class="note"><span class="eyebrow">' + T("note.trainerPlural") + "</span>" + ph.notes.map(esc).join("<br>") + "</div>" : "");
    const subtitle = (ex, st) => { const l = R.setLabel(st); return [R.exName(ex), l].filter(Boolean).join(" · "); };
    const itemsHTML = items => items.map(i => '<div class="nextup">' + titleHTML(EX[i.ex].name, R.exName(EX[i.ex])) + exerciseHTML(i, false) + "</div>").join("");

    /* ---- T2, solo con le opzioni dell'app ---- */
    // ripetizioni fatte (diario): parte dal numero della scheda, l'utente lo cambia; "max" e "almeno" partono dal minimo o da "—"
    function repsDoneHTML() {
      if (!R.features.diary) return "";
      const n = R.repsDone();
      return '<div class="chips"><div class="chip kg"><span>' + T("diary.done") + '</span><div class="kgrow"><button type="button" data-reps="-1" aria-label="' + T("aria.repsDown") + '">−</button><b>' +
        (n == null ? "—" : n) + '</b><button type="button" data-reps="1" aria-label="' + T("aria.repsUp") + '">+</button></div></div></div>';
    }
    // aggiungi / togli una serie (AC-P9): solo nelle fasi a serie e continue; le serie aggiunte e il totale diverso dalla scheda sono marcati
    function editSetsHTML(st, it, ph) {
      if (!R.features.editSets || st.type !== "work" || !EDITABLE_FLOWS.includes(ph.flow)) return "";
      const planned = Number.isInteger(it.sets) && it.sets > 0 ? it.sets : 1, parts = [];
      if (st.extra) parts.push(T("sets.added"));
      if (st.sets !== planned) parts.push(T("sets.inPlan", { n: planned }));
      return (parts.length ? '<p class="gear">' + esc(parts.join(" · ")) + "</p>" : "") +
        '<div class="adjust"><button type="button" data-sets="-1"' + (R.canRemoveSet(st.pi, st.ii) ? "" : " disabled") + ">" + T("sets.remove") + '</button><button type="button" data-sets="1">' + T("sets.add") + "</button></div>";
    }
    // valori confermati o corretti in revisione (R.marks, chiavi "seduta/fase" e "seduta/fase/voce"): campo, valore, originale
    function marksHTML(st, withItem) {
      const W = R.W, keys = [R.cur.wid + "/" + st.pi].concat(withItem && st.ii != null ? [R.cur.wid + "/" + st.pi + "/" + st.ii] : []);
      const list = keys.flatMap(k => R.marks[k] || []);
      if (!list.length || !W) return "";
      return '<p class="gear">' + esc(list.map(m => T(m.state === "corrected" ? "mark.corrected" : "mark.confirmed", { field: T("field." + m.field), value: m.value, original: m.original })).join(" · ")) + "</p>";
    }

    // il passo "block" (v1): EMOM (un intervallo), AMRAP, For Time
    function blockHTML(st, ph) {
      const items = R.blockItems(st), cur = R.cur, n = (cur.counts || {})[cur.idx] || 0;
      const counter = ph.flow === "amrap" || (ph.flow === "fortime" && ph.rounds > 1)
        ? '<div class="count"><div><span class="eyebrow">' + T("count.label") + '</span><b class="num" id="count">' + n + "</b></div>" +
          '<button type="button" class="btn ghost" data-act="round">' + T("count.add") + "</button></div>" : "";
      const state = ph.flow === "emom" ? (ph.every === 60 ? T("block.stateMinute") : T("block.every", { d: durText(ph.every) })) : ph.flow === "amrap" ? "AMRAP" : T("block.forTime");
      const dial = ph.flow === "fortime" ? (cur.endsAt == null ? dialHTML("free") : dialHTML(T("dial.cap", { t: fmt(ph.cap) }))) :
        dialHTML(ph.flow === "emom" ? T("dial.nextInterval") : T("dial.beepAtEnd"));
      const rows = '<div class="gate-ex">' + items.map(i => { const t = R.itemSummary(i, ph); return '<div class="row' + (t.length > 22 ? " long" : "") + '"><span>' + esc(EX[i.ex].name) + "</span><span>" + esc(t) + "</span></div>"; }).join("") + "</div>";
      return '<span class="state">' + esc(state) + "</span>" + titleHTML(ph.title, R.setLabel(st) || R.blockText(ph)) + dial +
        (ph.flow === "fortime" ? (cur.endsAt == null ? "" : pauseHTML()) : adjustHTML()) + counter + rows + phaseNotesHTML(ph) + marksHTML(st, false) + itemsHTML(items);
    }

    function render() {
      const W = R.W, STEPS = R.STEPS, cur = R.cur;
      const st = STEPS[cur.idx], ph = R.phaseOf(st), it = R.itemOf(st), ex = it ? EX[it.ex] : null, P = $("player");
      P.dataset.kind = st.type; P.classList.toggle("paused", !!cur.paused);
      $("where").innerHTML = (W.letter ? esc(W.letter) + " · " : "") + "<b>" + esc(ph.title) + "</b>";
      [...$("track").children].forEach((seg, pi) => {
        const mine = STEPS.map((s, i) => (s.pi === pi ? i : -1)).filter(i => i >= 0);
        seg.firstChild.style.width = Math.round(100 * mine.filter(i => i < cur.idx).length / mine.length) + "%";
      });
      $("btnPrev").disabled = cur.idx === 0;
      let h = "", main = T("btn.next");
      if (st.type === "gate") {
        main = cur.idx === 0 ? T("btn.start") : T("btn.startPhase");
        const gear = [...new Set(ph.items.map(i => EX[i.ex].gear))].filter(Boolean);
        h = '<span class="state">' + T("gate.phase", { n: st.pi + 1, of: W.phases.length }) + (ph.optional ? " · " + T("gate.optional") : "") + "</span>" + titleHTML(ph.title, R.blockText(ph)) +
          phaseNotesHTML(ph) +
          (ph.hr ? '<div class="hr"><label for="age">' + T("hr.age") + '</label><input id="age" type="number" inputmode="numeric" min="10" max="99" value="' + (S.age || "") + '"><output id="ageOut" for="age"></output></div>' : "") +
          '<div class="gate-ex">' + R.rowsHTML(ph) + "</div>" +
          (gear.length ? '<p class="gear">' + esc(T("gate.gear", { list: gear.join(" — ") })) + "</p>" : "") + marksHTML(st, false);
      } else if (st.type === "prep") {
        main = T("btn.goNow");
        h = '<span class="state">' + T("state.prep") + "</span>" + titleHTML(ex.name, subtitle(ex, st)) + dialHTML(T("dial.getReady")) + adjustHTML() +
          (st.round > 1 && st.ii === 0 && ph.roundNote ? noteHTML(T("round.note", { n: st.round, note: ph.roundNote })) : "") + chipsHTML(it, st, true) + marksHTML(st, true) + exerciseHTML(it, true);
      } else if (st.type === "work" && !R.v1) {
        const timed = it.mode === "timed";
        main = timed ? T("btn.doneNext") : T("btn.setDone");
        h = '<span class="state">' + (timed ? T("state.work") : T("state.yourTurn")) + "</span>" + titleHTML(ex.name, R.exName(ex)) +
          (timed ? dialHTML(T("dial.beepAtEnd"), it) + adjustHTML() : dialHTML("reps", it) + repsDoneHTML()) + chipsHTML(it, st, true) +
          editSetsHTML(st, it, ph) + marksHTML(st, true) + exerciseHTML(it, true);
      } else if (st.type === "work") {
        const u = R.unitOf(st), next = STEPS[cur.idx + 1];
        const sameSet = next && next.type === "work" && next.pi === st.pi && next.ii === st.ii && next.set === st.set && next.round === st.round && (next.part || 0) > 0;
        let state, dial;
        if (cur.view === "hold") { state = T("state.hold"); dial = holdDialHTML() + pauseHTML(); main = T("btn.doneNext"); }
        else if (cur.endsAt != null) { state = T("state.work"); dial = dialHTML(T("dial.beepAtEnd")) + adjustHTML(); main = T("btn.doneNext"); }
        else {
          state = u.kind === "drop" ? T("state.dropLoad") : u.kind === "part" && st.part > 0 ? T("state.noPause") : T("state.yourTurn");
          dial = repsDialHTML(u.reps) + repsDoneHTML();
          main = sameSet ? (it.drops ? T("btn.doneDrop") : T("btn.donePart")) : T("btn.setDone");
        }
        const partNote = u && u.text ? '<div class="note"><span class="eyebrow">' + T("note.thisPart") + "</span>" + esc(u.text) + "</div>" : "";
        h = '<span class="state">' + state + "</span>" + titleHTML(ex.name, R.exName(ex)) + dial +
          (st.round > 1 && st.ii === 0 && ph.roundNote && !st.part ? noteHTML(T("round.note", { n: st.round, note: ph.roundNote })) : "") + partNote + chipsHTML(it, st, true) +
          editSetsHTML(st, it, ph) + marksHTML(st, true) + exerciseHTML(it, true);
      } else if (st.type === "block") {
        main = ph.flow === "emom" ? (ph.every === 60 ? T("btn.nextMinute") : T("btn.nextInterval")) : ph.flow === "amrap" ? T("btn.doneNext") : T("btn.finished");
        h = blockHTML(st, ph);
      } else if (st.type === "free") {
        // passo libero: ciò che la sequenza non sa guidare, mostrato così come sta nei dati, con un cronometro in avanti
        main = T("btn.doneNext");
        h = '<span class="state">' + T("state.followPlan") + "</span>" + (it
          ? titleHTML(ex.name, subtitle(ex, st)) + dialHTML("free") +
            '<div class="note"><span class="eyebrow">' + T("note.fromPlan") + "</span>" + esc(R.itemSummary(it, ph)) + "</div>" + marksHTML(st, true) + exerciseHTML(it, true)
          : titleHTML(ph.title, R.blockText(ph)) + dialHTML("free") + phaseNotesHTML(ph) + '<div class="gate-ex">' + R.rowsHTML(ph) + "</div>" + marksHTML(st, false) + itemsHTML(ph.items));
      } else {
        main = T("btn.skipRest");
        const n = R.nextWork(cur.idx), ni = n && R.itemOf(n), same = ni === it;
        const free = cur.endsAt == null; // v1: recupero "a sensazione", senza numeri: cronometro in avanti
        if (free) main = T("btn.ready");
        h = '<span class="state">' + T("state.rest") + "</span>" + titleHTML(T("rest.title"), it.restCue || T("rest.cue")) +
          (free ? dialHTML("free") + '<div class="note"><span class="eyebrow">' + T("note.fromPlan") + "</span>" + esc(T("rest.fromPlan", { text: it.restText || "" })) + "</div>" : dialHTML(T("dial.thenGo")) + adjustHTML()) +
          (ni && n.type !== "free" ? '<div class="nextup"><span class="eyebrow">' + T("rest.next") + "</span>" + titleHTML(EX[ni.ex].name, R.exName(EX[ni.ex])) + chipsHTML(ni, n, false) + exerciseHTML(ni, !same) + "</div>"
              : n ? '<div class="nextup"><span class="eyebrow">' + T("rest.next") + "</span>" + titleHTML(ni ? EX[ni.ex].name : R.phaseOf(n).title, n.type === "free" ? T("state.followPlan") : T("rest.newPhase")) + "</div>" : "");
      }
      const away = cur.notice ? '<div class="note"><span class="eyebrow">' + T("note.away") + "</span>" + esc(cur.notice) + "</div>" : "";
      const fallback = cur.fallbackNotice ? '<div class="note"><span class="eyebrow">' + T("note.fallback") + "</span>" + esc(cur.fallbackNotice) + "</div>" : "";
      $("stage").innerHTML = fallback + away + h; $("btnMain").textContent = main;
      if (cur.endsAt != null) { cur.lastSec = Math.ceil(R.remainingMs() / 1000); paintClock(R.remainingMs()); }
      paintAge();
    }
    function paintAge() { const o = $("ageOut"); if (o) o.textContent = R.bpm() ? T("hr.targetBpm", { n: R.bpm() }) : T("hr.hint"); }

    function paintClock(ms) {
      const big = $("big"); if (!big) return;
      const cur = R.cur, rng = $("ring");
      let sec = Math.ceil(Math.max(0, ms) / 1000), frac = Math.max(0, Math.min(1, ms / cur.total));
      if (cur.view === "hold") { // tenuta per ripetizione: secondi della tenuta (o del rilascio) in corso
        const h = V.holdAt(R.unitOf(R.STEPS[cur.idx]), cur.total - Math.max(0, ms));
        sec = Math.ceil(h.leftMs / 1000); frac = h.spanMs ? h.leftMs / h.spanMs : 0;
        const sub = $("holdSub");
        if (sub) sub.textContent = cur.paused ? T("dial.paused") : h.phase === "hold" ? T("hold.hold", { n: h.rep, of: h.reps }) : T("hold.release", { n: h.rep + 1 });
      } else if (cur.view === "up") { // For Time con tetto: il quadrante conta in avanti
        sec = Math.floor((cur.total - Math.max(0, ms)) / 1000); frac = 1 - frac;
      }
      big.textContent = sec >= 60 || cur.view === "up" ? fmt(sec) : String(sec);
      big.classList.toggle("long", sec >= 600);
      if (rng) rng.style.strokeDashoffset = String(CIRC * (1 - frac));
    }
    function paintElapsed(sec) { const el = $("elapsed"); if (el) el.textContent = fmt(sec); }

    function mountPlayer() {
      $("track").innerHTML = R.W.phases.map((ph, pi) => '<i style="flex:' + R.STEPS.filter(s => s.pi === pi).length + '"><b></b></i>').join("");
      R.show("player");
    }

    return { render, paintAge, paintClock, paintElapsed, mountPlayer };
  };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
