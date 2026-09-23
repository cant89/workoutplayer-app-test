/* Script di composizione "ordine standard" per l'API v1 (lib/API-v1.md): dà la stessa sequenza del rendering di riserva v1
   (lib/engine/fallback.js), scritta con i soli dati e i costruttori di api.steps. Nessuna scelta diversa dall'ordine
   standard è richiesta da questa scheda: gli esercizi "Metodo Kellerman" non hanno numeri sufficienti per essere
   guidati (mode "text") e diventano automaticamente passi liberi tramite la funzione guidata(). */
function compose(plan, api) {
  "use strict";
  const { gate, prep, work, rest, free, block } = api.steps;
  const intero = v => Number.isInteger(v) && v > 0;
  const positivo = v => typeof v === "number" && v > 0;
  const nonNeg = v => typeof v === "number" && v >= 0;
  const INTERVALLI = ["intervals", "tabata"];
  const ripOk = r => intero(r) || r === "max" ||
    (!!r && typeof r === "object" && !Array.isArray(r) && intero(r.min) && (r.max == null || (intero(r.max) && r.max > r.min)));
  const tenutaOk = u => u.hold == null || (intero(u.reps) && positivo(u.hold) && (u.holdRest == null || nonNeg(u.holdRest)));
  const latiOk = it => !it.perSide || (Array.isArray(it.sides) && it.sides.length > 1);
  const bloccoOk = ph => {
    if (!Array.isArray(ph.items) || !ph.items.length) return false;
    if (ph.flow === "emom") return intero(ph.every) && intero(ph.rounds) && (ph.items.length === 1 || ["one", "all"].includes(ph.perInterval));
    if (ph.flow === "amrap") return intero(ph.time);
    if (ph.flow === "fortime") return (ph.cap == null || intero(ph.cap)) && (ph.rounds == null || intero(ph.rounds));
    return false;
  };
  const intervalliOk = ph => intero(ph.work) && intero(ph.rounds) && (ph.rest == null || nonNeg(ph.rest)) && ph.items.length > 0;
  function guidata(ph, it) {
    if (!latiOk(it)) return false;
    if (INTERVALLI.includes(ph.flow)) return intervalliOk(ph);
    if (it.mode === "timed") return positivo(it.dur) && !it.parts && !it.drops && it.hold == null;
    if (it.mode !== "reps") return false;
    if (it.parts != null) return Array.isArray(it.parts) && it.parts.length > 1 && it.reps == null && !it.drops && it.hold == null &&
      it.parts.every(p => p && ripOk(p.reps) && tenutaOk(p));
    if (!ripOk(it.reps) || !tenutaOk(it)) return false;
    if (it.drops != null) return Array.isArray(it.drops) && it.drops.length > 0 && ["all", "last"].includes(it.dropOn) &&
      it.drops.every(d => d && ripOk(d.reps) && (d.kg == null || positivo(d.kg)));
    return true;
  }
  function parti(it, set, sets) {
    if (Array.isArray(it.parts)) return it.parts;
    const principale = { reps: it.reps, hold: it.hold };
    if (Array.isArray(it.drops) && (it.dropOn === "all" || set === sets)) return [principale].concat(it.drops);
    return [principale];
  }
  const aTempo = (ph, it, u) => INTERVALLI.includes(ph.flow) || it.mode === "timed" || (u && u.hold != null);
  function recupero(ph, ii, giro) {
    const it = ph.items[ii];
    if (INTERVALLI.includes(ph.flow)) return nonNeg(ph.rest) && ph.rest > 0;
    if (ph.flow === "circuit" && Array.isArray(ph.roundRest) && ii === ph.items.length - 1) return positivo(ph.roundRest[giro - 1]);
    return positivo(it.rest) || (typeof it.restText === "string" && it.restText !== "");
  }

  function passi(w) {
    const out = [];
    w.phases.forEach((ph, pi) => {
      out.push(gate({ pi }));
      const flow = ph.flow || "sets";
      const serie = (ii, set, sets, round) => {
        const it = ph.items[ii], base = { pi, ii, set, sets, round };
        if (!guidata(ph, it)) out.push(free(base));
        else {
          const lati = it.perSide ? it.sides.length : 1, pp = parti(it, set, sets);
          for (let side = 0; side < lati; side++) {
            pp.forEach((u, part) => {
              const at = Object.assign({}, base, it.perSide ? { side } : {}, pp.length > 1 ? { part } : {});
              const prima = out[out.length - 1];
              if (part === 0 && aTempo(ph, it, u) && prima.type !== "rest" && !(flow === "continuous" && ii > 0) &&
                  !(INTERVALLI.includes(flow) && round > 1)) out.push(prep(at));
              out.push(work(at));
            });
          }
        }
        if (recupero(ph, ii, round) && !(it.noRestAfterLast && set === sets)) out.push(rest(base));
      };
      if (flow === "sets" || flow === "continuous") {
        ph.items.forEach((it, ii) => {
          const sets = intero(it.sets) ? it.sets : 1;
          for (let set = 1; set <= sets; set++) serie(ii, set, sets, 0);
        });
      } else if (flow === "circuit" && intero(ph.rounds)) {
        for (let r = 1; r <= ph.rounds; r++) ph.items.forEach((_, ii) => serie(ii, 1, 1, r));
      } else if (INTERVALLI.includes(flow) && intervalliOk(ph)) {
        for (let r = 1; r <= ph.rounds; r++) serie((r - 1) % ph.items.length, 1, 1, r);
      } else if (flow === "emom" && bloccoOk(ph)) {
        for (let r = 1; r <= ph.rounds; r++) out.push(block({ pi, round: r }));
      } else if ((flow === "amrap" || flow === "fortime") && bloccoOk(ph)) {
        out.push(block({ pi, round: 0 }));
      } else out.push(free({ pi }));
      if (out[out.length - 1].type === "rest") out.pop();
    });
    return out;
  }

  const risultato = {};
  Object.keys(plan.workouts).forEach(id => { risultato[id] = passi(plan.workouts[id]); });
  return risultato;
}
