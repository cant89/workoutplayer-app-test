/* WorkoutPlayer · app: revisione dei valori letti (T2, AC-R1…R4, D-U7). Solo logica, niente DOM: la usano le viste
   (app/js/viste.js), il player (app/js/avvio.js) e i test (tests/app.test.js).

   I dati con provenienza e certezza sono quelli del generatore v1 (schema wp-plan/1, generator/SCHEMA-v1.md): ogni numero
   è un oggetto Numero { valore, tipo, unita, scritto, fonte, certezza, letture, normalizzazione, motivo }. Il player legge
   invece il piano per la libreria (libreria.json, stesso ordine di sedute, fasi e voci: generator/converti_v1.py).
   - campo = un numero, oppure i due estremi di un intervallo (min/max) insieme; incerto = certezza "bassa";
   - destinazione = il campo del piano per la libreria che quel numero diventa (sets, reps, reps.min, dur, kg, rest, hold,
     drops[n].reps, rounds, roundRest[n], work, every, time/cap, …); nessuna destinazione per ciò che la libreria non ha
     (durata a intervallo, numero dei lati, serie nei circuiti e nei blocchi): la correzione resta nella revisione e nel
     player la voce resta com'è scritta nella scheda;
   - finché un campo incerto non è confermato o corretto il piano è "da rivedere" e non si apre nel player (D-U7);
   - la revisione registra per ogni campo toccato: stato ("confirmed" | "corrected"), valori nuovi e originali, data.
     I valori corretti entrano nel piano per il player (applica), mai in silenzio: il player li mostra marcati (segni). */
(function (App) {
  "use strict";
  const WP = () => globalThis.WorkoutPlayer;
  const BLOCK_FLOWS = ["intervalli", "tabata", "emom", "amrap", "a_tempo"];
  const RANGE = ["min", "max", "almeno"];
  const isNumero = o => !!o && typeof o === "object" && !Array.isArray(o) && "valore" in o && "tipo" in o;
  // campo dello schema → campo della libreria, per le etichette dei campi senza destinazione ("field.*" nei file di lingua)
  const FIELD = { serie: "sets", ripetizioni: "reps", durata: "dur", carico: "kg", recupero: "rest", tenuta: "hold", rilascio: "holdRest",
    giri: "rounds", recuperi_giro: "roundRest", lavoro: "work", pausa: "rest", ogni: "every", tempo_limite: "time", lati: "sides", scalate: "drops", parti: "parts" };
  const copy = v => JSON.parse(JSON.stringify(v));

  // tutti i numeri delle sedute: [{ path, n }], nell'ordine dei dati
  function numeri(data) {
    const out = [];
    const walk = (o, path) => {
      if (Array.isArray(o)) { o.forEach((v, i) => walk(v, path.concat(i))); return; }
      if (!o || typeof o !== "object") return;
      if (isNumero(o)) { out.push({ path, n: o }); return; }
      Object.keys(o).forEach(k => walk(o[k], path.concat(k)));
    };
    ((data && data.sedute) || []).forEach((s, i) => walk(s, ["sedute", i]));
    return out;
  }

  /* ---- destinazione nel piano per la libreria ---- */
  const repsSub = sub => (sub == null ? [] : sub === "min" || sub === "almeno" ? ["min"] : sub === "max" ? ["max"] : null);
  function voceField(v, flusso, rest, api) {
    const f = rest[0], a = rest[1], b = rest[2], c = rest[3];
    switch (f) {
      case "serie": return flusso === "circuito" || BLOCK_FLOWS.includes(flusso) || (v.lato && v.lato.modo === "serie_per_lato" && api !== "v1") ? null : ["sets"];
      case "ripetizioni": { const r = repsSub(a); return r && (api === "v1" || a == null) ? ["reps"].concat(r) : null; }
      case "durata": return a == null ? ["dur"] : null;
      case "carico": return a == null && (v.carico.unita == null || v.carico.unita === "kg") ? ["kg"] : null;
      case "recupero": return a == null ? ["rest"] : null;
      case "tenuta": return api === "v1" && a == null ? ["hold"] : null;
      case "rilascio": return api === "v1" && a == null ? ["holdRest"] : null;
      case "scalate": {
        if (api !== "v1" || a !== "parti") return null;
        if (c === "ripetizioni") { const r = repsSub(rest[4]); return r ? ["drops", b, "reps"].concat(r) : null; }
        return c === "carico" && rest[4] == null ? ["drops", b, "kg"] : null;
      }
      case "parti": {
        if (api !== "v1") return null;
        if (b === "ripetizioni") { const r = repsSub(c); return r ? ["parts", a, "reps"].concat(r) : null; }
        return { tenuta: ["parts", a, "hold"], rilascio: ["parts", a, "holdRest"] }[b] || null;
      }
      default: return null;
    }
  }
  function faseField(ph, rest) {
    const f = rest[0], a = rest[1];
    if (f === "recuperi_giro") return a != null ? ["roundRest", a] : null;
    if (f === "tempo_limite") return [ph.flusso === "amrap" ? "time" : "cap"];
    return { giri: ["rounds"], lavoro: ["work"], pausa: ["rest"], ogni: ["every"] }[f] || null;
  }
  // { wid, pi, ii, field, lib: percorso nel piano per la libreria } oppure null
  function target(data, lib, path) {
    if (path[0] !== "sedute" || path[2] !== "fasi") return null;
    const s = data.sedute[path[1]], ph = s && s.fasi[path[3]];
    const w = s && lib.workouts[s.id];
    if (!ph || !w || !w.phases[path[3]]) return null;
    const base = ["workouts", s.id, "phases", path[3]];
    if (path[4] === "voci") {
      const lp = voceField(ph.voci[path[5]], ph.flusso, path.slice(6), lib.api);
      return lp ? { wid: s.id, pi: path[3], ii: path[5], field: lp[0], lib: base.concat(["items", path[5]], lp) } : null;
    }
    const lp = faseField(ph, path.slice(4));
    return lp ? { wid: s.id, pi: path[3], ii: null, field: lp[0], lib: base.concat(lp) } : null;
  }
  const getAt = (o, p) => p.reduce((x, k) => (x == null ? undefined : x[k]), o);
  function setAt(o, p, v) { const last = p[p.length - 1], parent = getAt(o, p.slice(0, -1)); if (parent != null) parent[last] = v; }

  /* ---- campi ---- */
  // un campo per numero, o per intervallo (min/max, almeno) di una stessa grandezza
  function campi(data, lib) {
    const out = [], byKey = {};
    numeri(data).forEach(({ path, n }) => {
      const range = RANGE.includes(path[path.length - 1]);
      const gpath = range ? path.slice(0, -1) : path, key = gpath.join("/");
      let c = byKey[key];
      if (!c) {
        const s = data.sedute[path[1]], ph = s.fasi[path[3]], v = path[4] === "voci" ? ph.voci[path[5]] : null;
        c = byKey[key] = { key, path: gpath, parts: [], tipo: n.tipo, uncertain: false,
          where: { seduta: s.titolo, fase: ph.titolo, esercizio: v ? v.esercizio : null, voce: path[4] === "voci" ? path[5] : null },
          pos: { wid: s.id, pi: path[3], ii: path[4] === "voci" ? path[5] : null }, // stessa seduta, fase e voce nel piano per la libreria
          field: gpath[gpath.length - 1] };
        out.push(c);
      }
      const t = target(data, lib, path);
      c.parts.push({ sub: range ? path[path.length - 1] : null, path, n, target: t });
      if (n.certezza === "bassa") c.uncertain = true;
    });
    // il campo della libreria (per le etichette e i segni): quello del primo numero che ha una destinazione, altrimenti quello
    // che corrisponde al campo dello schema
    out.forEach(c => {
      const t = c.parts.find(p => p.target), known = c.path.slice(4).filter(x => typeof x === "string" && FIELD[x]);
      c.libField = t ? t.target.field : null;
      c.labelField = c.libField || FIELD[known[known.length - 1]] || null;
    });
    return out;
  }
  const reviewOf = rec => (rec.review = rec.review || { fields: {} });
  const pending = rec => (rec.kind !== "plan" || !rec.data ? 0 : campi(rec.data, rec.lib).filter(c => c.uncertain && !reviewOf(rec).fields[c.key]).length);
  const playable = rec => rec.kind === "preview" || (pending(rec) === 0 && (!rec.data || !campi(rec.data, rec.lib).some(c => c.uncertain) || !!reviewOf(rec).confirmedAt));

  // conferma o correzione di un campo: values = { sub | "": numero } nell'unità canonica (s, kg, ripetizioni, serie, giri)
  function registra(rec, c, values) {
    const originals = {}, vals = {};
    c.parts.forEach(p => { const k = p.sub || ""; originals[k] = p.n.valore; vals[k] = values && values[k] != null ? values[k] : p.n.valore; });
    const changed = Object.keys(vals).some(k => vals[k] !== originals[k]);
    reviewOf(rec).fields[c.key] = { state: changed ? "corrected" : "confirmed", values: vals, originals, at: Date.now() };
    return reviewOf(rec).fields[c.key];
  }
  function concludi(rec) { if (pending(rec)) return false; reviewOf(rec).confirmedAt = reviewOf(rec).confirmedAt || Date.now(); return true; }

  // il piano per il player con i valori corretti dall'utente (solo dove la destinazione ha ancora il valore letto)
  function applica(rec) {
    const lib = copy(rec.lib);
    if (!rec.data) return lib;
    const fields = reviewOf(rec).fields;
    campi(rec.data, rec.lib).forEach(c => {
      const r = fields[c.key]; if (!r || r.state !== "corrected") return;
      c.parts.forEach(p => { if (p.target && getAt(lib, p.target.lib) === p.n.valore) setAt(lib, p.target.lib, r.values[p.sub || ""]); });
    });
    return lib;
  }

  /* ---- testi ---- */
  // un valore nell'unità del suo tipo, nella lingua dell'interfaccia: "4 serie", "12 ripetizioni", "1:30 min", "62,5 kg", "3 giri"
  function formato(tipo, v, lang, unita) {
    const T = (k, p) => WP().i18n.t(lang, k, p), U = WP().util;
    if (v == null || v === "") return "—";
    switch (tipo) {
      case "serie": return T("sum.sets", { n: v });
      case "ripetizioni": return T("sum.reps", { r: v });
      case "tempo": case "recupero": return U.durText(v);
      case "carico": return U.fmtKg(v, T("num.decimal")) + " " + (unita || "kg");
      case "giri": return T("block.rounds", { n: v });
      default: return String(v);
    }
  }
  // il campo intero: "30 min – 45 min", "15-20 ripetizioni", "4 serie"; bare: i conteggi senza la parola ("4", "15-20")
  const COUNTS = ["serie", "ripetizioni", "giri", "lati"];
  function testoCampo(c, values, lang, bare) {
    const val = p => (values ? values[p.sub || ""] : p.n.valore);
    if (bare && COUNTS.includes(c.tipo)) return c.parts.map(val).join("-");
    if (c.parts.length === 1) return formato(c.tipo, val(c.parts[0]), lang, c.parts[0].n.unita);
    if (c.tipo === "ripetizioni") return WP().i18n.t(lang, "sum.reps", { r: c.parts.map(val).join("-") });
    return c.parts.map(p => formato(c.tipo, val(p), lang, p.n.unita)).join(" – ");
  }
  // valori confermati o corretti, per il player: { "seduta/fase[/voce]": [{ field, state, value, original }] }; anche per i campi
  // senza destinazione (la voce resta come è scritta nella scheda, il valore dato dall'utente si legge nel segno)
  function segni(rec, lang) {
    const out = {};
    if (!rec.data) return out;
    const fields = reviewOf(rec).fields;
    campi(rec.data, rec.lib).forEach(c => {
      const r = fields[c.key];
      if (!r || !c.labelField || !rec.lib.workouts[c.pos.wid]) return;
      const k = c.pos.wid + "/" + c.pos.pi + (c.pos.ii != null ? "/" + c.pos.ii : "");
      (out[k] = out[k] || []).push({ field: c.labelField, state: r.state, value: testoCampo(c, r.values, lang), original: testoCampo(c, null, lang) });
    });
    return out;
  }
  // perché un numero è incerto: disaccordo fra le letture, unità da confermare, niente provenienza, altro
  function perche(c) {
    const n = c.parts.map(p => p.n).find(x => x.certezza === "bassa") || c.parts[0].n;
    const lett = Array.isArray(n.letture) ? [...new Set(n.letture.map(Number))] : [];
    if (lett.length > 1) return { kind: "disagree", values: n.letture.join(" / ") };
    if (n.normalizzazione) return { kind: "unit", written: n.scritto || "" };
    if (!n.fonte) return { kind: "nosource" };
    return { kind: "other" };
  }
  // la riga del documento da cui viene il numero: { testo, doc, pagina, foglio, riga, cella }
  function fonte(data, c) {
    const n = c.parts[0].n, f = n.fonte && data.fonti && data.fonti[n.fonte];
    if (!f) return null;
    const doc = (data.documenti || []).find(d => d.id === f.doc);
    return Object.assign({ docName: doc ? doc.nome : f.doc }, f);
  }

  App.revisione = { FIELD, numeri, target, campi, pending, playable, registra, concludi, applica, segni, formato, testoCampo, perche, fonte, getAt };
})(globalThis.WorkoutPlayerApp = globalThis.WorkoutPlayerApp || {});
