/* WorkoutPlayer · motore: testi ricavati dai dati (carichi, riepiloghi, etichette di serie e lato, battiti obiettivo).
   Servono sia ai componenti sia alla voce. Da src/app1.js:24-42 e src/app2.js:10-18.
   Per i piani v1 (R.v1) anche: ripetizioni a intervallo / almeno / max, parti della serie (scalate, serie composta),
   lati delle voci per lato, giri degli intervalli, intervalli dell'EMOM, prescrizioni aperte (rx) come testo.
   Regola: un campo facoltativo assente non produce testo (mai "undefined").
   Lingue (T2): ogni funzione che produce parole accetta la lingua come ultimo parametro; senza, vale la lingua
   dell'interfaccia (R.lang). La voce le chiama con la lingua del piano (R.voiceLang). Le parole stanno in lib/lang/. */
(function (WP) {
  "use strict";
  WP.modules.texts = function (R) {
    const { durText } = WP.util;
    const S = R.S, EX = R.EX, V = WP.v1;
    const T = (lang, key, p) => WP.i18n.t(lang || R.lang, key, p);
    const fmtKg = (v, lang) => WP.util.fmtKg(v, T(lang, "num.decimal"));
    const kgOf = item => (typeof item.kg === "number" ? (S.kg[item.ex] != null ? S.kg[item.ex] : item.kg) : item.kg);
    const kgText = (item, lang) => { const k = kgOf(item); return k == null ? T(lang, "kg.free") : k === "BW" ? T(lang, "kg.bw") : fmtKg(k, lang) + " kg"; };
    const exName = ex => (ex ? ex.it || ex.name || "" : "");

    /* ---- v1: ripetizioni e parti ---- */
    const repsText = (r, lang) => (typeof r === "number" ? String(r) : r === "max" ? T(lang, "reps.max") : r && typeof r === "object" ? (r.max != null ? r.min + "-" + r.max : r.min + "+") : String(r == null ? "" : r));
    const repsVoice = (r, lang) => (typeof r === "number" ? T(lang, "voice.reps", { n: r }) : r === "max" ? T(lang, "voice.repsMax") :
      r && r.max != null ? T(lang, "voice.repsRange", { min: r.min, max: r.max }) : r ? T(lang, "voice.repsMin", { n: r.min }) : "");
    const unitText = (u, lang) => repsText(u.reps, lang) + (u.hold != null ? " (" + T(lang, "sum.hold", { d: durText(u.hold) }) + ")" : "") + (u.text ? " " + u.text : "");
    // tutte le serie di una voce, compatto: "4 × 12 per lato", "3 × (8 + 8 esplosive)", "3 × 10-12, ultima + 8 + 8"
    function repsSummaryV1(it, lang) {
      const sets = Number.isInteger(it.sets) && it.sets > 0 ? it.sets : null;
      let core = Array.isArray(it.parts) ? "(" + it.parts.map(u => unitText(u, lang)).join(" + ") + ")" : unitText({ reps: it.reps, hold: it.hold }, lang);
      if (Array.isArray(it.drops)) core += (it.dropOn === "last" && sets > 1 ? ", " + T(lang, "sum.lastSet") : "") + " + " + it.drops.map(d => repsText(d.reps, lang)).join(" + ");
      return (sets ? sets + " × " : "") + core + (it.perSide ? " " + T(lang, "sum.perSide") : "");
    }
    const unitOf = st => { const it = R.itemOf(st); return it ? V.unitsOf(it, st.set, st.sets)[st.part || 0] : null; };
    // la parte di una serie divisa in più parti: { kind: "drop" | "part", n, of } ("Scalata 1 di 2" / "Parte 2 di 2")
    const partInfo = st => {
      const it = R.itemOf(st); if (!it || st.part == null) return null;
      const units = V.unitsOf(it, st.set, st.sets); if (units.length < 2) return null;
      return Array.isArray(it.drops) ? (st.part ? { kind: "drop", n: st.part, of: units.length - 1 } : null) : { kind: "part", n: st.part + 1, of: units.length };
    };
    const partLabel = (st, lang) => { const p = partInfo(st); return p ? T(lang, "label." + p.kind, p) : ""; };
    const rxText = it => (Array.isArray(it.rx) ? it.rx.filter(x => typeof x === "string" && x).join(" · ") : "");

    // voce che la libreria non sa guidare (passo libero): i numeri che i dati hanno, così come sono
    const rawSummary = (it, lang) => [
      it.sets != null ? T(lang, "sum.sets", { n: it.sets }) : "",
      it.reps != null ? T(lang, "sum.reps", { r: R.v1 ? repsText(it.reps, lang) : it.reps }) : "",
      it.dur != null ? (typeof it.dur === "number" ? durText(it.dur) : String(it.dur)) : "",
      it.kg != null ? kgText(it, lang) : "",
      it.label || "", it.text || ""
    ].filter(Boolean).join(" · ") || T(lang, "sum.asWritten");
    const itemSummaryV0 = (it, phase, lang) => {
      if (!WP.isGuidedItem(it)) return rawSummary(it, lang);
      if (it.mode === "reps") return it.sets + " × " + it.reps + " · " + kgText(it, lang);
      const rounds = phase && phase.flow === "circuit" ? phase.rounds : it.sets;
      return (rounds > 1 ? rounds + " × " : "") + durText(it.dur) + (it.label && /^RPE/.test(it.label) ? " · " + it.label : "");
    };
    const kgPart = (it, lang) => (it.kg != null || it.mode === "reps" ? " · " + kgText(it, lang) : "");
    function itemSummaryV1(it, phase, lang) {
      const ph = phase || {}, rpe = it.label && /^RPE/.test(it.label) ? " · " + it.label : "";
      if (V.BLOCK_FLOWS.includes(ph.flow)) { // voce di un blocco a cronometro: quanto se ne fa per giro o per intervallo
        if (it.mode === "timed" && typeof it.dur === "number") return durText(it.dur) + kgPart(it, lang);
        return it.reps != null ? T(lang, "sum.repsShort", { r: repsText(it.reps, lang) }) + kgPart(it, lang) : rawSummary(it, lang);
      }
      if (!V.guided(ph, it)) return rawSummary(it, lang);
      if (V.INTERVAL_FLOWS.includes(ph.flow)) return durText(ph.work) + (it.kg != null ? " · " + kgText(it, lang) : "") + rpe;
      if (it.mode === "reps") return repsSummaryV1(it, lang) + " · " + kgText(it, lang);
      const rounds = ph.flow === "circuit" ? ph.rounds : it.sets;
      return (rounds > 1 ? rounds + " × " : "") + durText(it.dur) + (it.perSide ? " " + T(lang, "sum.perSide") : "") + rpe;
    }
    const itemSummary = (it, phase, lang) => (R.v1 ? itemSummaryV1(it, phase, lang) : itemSummaryV0(it, phase, lang));

    // righe di riepilogo di una fase: i blocchi uguali in sequenza (tapis roulant) diventano una riga sola
    function phaseRows(ph, lang) {
      const its = ph.items;
      if (ph.flow === "continuous" && its.length > 1 && its.every(i => i.ex === its[0].ex)) {
        const rpe = its.map(i => (i.label || "").replace("RPE ", "")).filter(Boolean);
        return [[EX[its[0].ex].name, its.length + " × " + durText(its[0].dur) + (rpe.length ? " · RPE " + rpe[0] + " → " + rpe[rpe.length - 1] : "")]];
      }
      return its.map(i => [EX[i.ex].name, itemSummary(i, ph, lang)]);
    }
    // il blocco a cronometro, gli intervalli e il circuito in una riga (sottotitolo dell'ingresso di fase e del passo)
    function blockText(ph, lang) {
      if (!R.v1) return ph.flow === "circuit" ? T(lang, "block.circuitV0", { n: ph.rounds }) : "";
      if (ph.flow === "circuit") return T(lang, "block.rounds", { n: ph.rounds }) + (Array.isArray(ph.roundRest) ? ", " + T(lang, "block.roundRest", { list: ph.roundRest.map(s => durText(s)).join(" → ") }) : "");
      if (ph.flow === "emom" && V.blockOk(ph)) return (ph.every === 60 ? T(lang, "block.emomMinute") : T(lang, "block.every", { d: durText(ph.every) })) + ", " + T(lang, "block.intervals", { n: ph.rounds }) +
        (ph.items.length > 1 ? ", " + T(lang, ph.perInterval === "one" ? "block.oneEach" : "block.allEach") : "");
      if (ph.flow === "amrap" && V.blockOk(ph)) return T(lang, "block.amrap", { d: durText(ph.time) });
      if (ph.flow === "fortime" && V.blockOk(ph)) return T(lang, "block.forTime") + (ph.rounds ? ", " + T(lang, "block.rounds", { n: ph.rounds }) : "") + (ph.cap ? ", " + T(lang, "block.cap", { d: durText(ph.cap) }) : "");
      if (V.INTERVAL_FLOWS.includes(ph.flow) && V.intervalsOk(ph)) return (ph.flow === "tabata" ? "Tabata: " : "") + T(lang, "block.intervalRounds", { n: ph.rounds, d: durText(ph.work) }) + (ph.rest ? " / " + T(lang, "block.intervalRest", { d: durText(ph.rest) }) : "");
      return "";
    }

    // serie, giro, blocco o intervallo di un passo: { kind, n, of, side } (kind vuoto = nessuna etichetta)
    const setInfo = st => {
      const it = R.itemOf(st), ph = R.phaseOf(st);
      if (R.v1 && st.type === "block") return ph.flow === "emom" ? { kind: ph.every === 60 ? "minute" : "interval", n: st.round, of: ph.rounds } : { kind: "" };
      if (R.v1 && V.INTERVAL_FLOWS.includes(ph.flow)) return { kind: "round", n: st.round, of: ph.rounds };
      if (ph.flow === "circuit") return { kind: "round", n: st.round, of: ph.rounds, side: R.v1 && it && it.perSide && st.side != null ? it.sides[st.side] : null };
      if (ph.flow === "continuous") return ph.items.length > 1 ? { kind: "block", n: st.ii + 1, of: ph.items.length } : { kind: "" };
      let side = null;
      if (R.v1 && it && it.perSide) { if (st.side != null) side = it.sides[st.side]; }
      else if (it.sides) side = it.sides[(st.set - 1) % it.sides.length];
      return { kind: "set", n: st.set, of: st.sets, side };
    };
    const setLabel = (st, lang) => { const i = setInfo(st); return i.kind ? T(lang, "label." + i.kind, i) + (i.side ? " · " + i.side : "") : ""; };
    // nome del lato senza la parola "Lato" della lingua del piano ("Lato sinistro" → "sinistro"), per il riquadro "Lato"
    const sideValue = side => { const pre = R.voiceLang ? T(R.voiceLang, "data.sidePrefix") : ""; return pre && side.indexOf(pre) === 0 ? side.slice(pre.length) : side; };
    // fasi con hr: obiettivo al 90% della FC max stimata (220 - età)
    const bpm = () => (S.age ? Math.round(0.9 * (220 - S.age)) : null);

    return { kgOf, kgText, fmtKg, exName, itemSummary, phaseRows, blockText, setInfo, setLabel, sideValue, bpm, repsText, repsVoice, unitOf, partInfo, partLabel, rxText };
  };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
