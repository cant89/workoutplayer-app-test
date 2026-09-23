/* WorkoutPlayer · rendering di riserva: la sequenza dei passi dai soli dati del piano, senza script di composizione.
   È il paracadute quando lo script manca o non supera le verifiche, e il termine di confronto dello script.
   Le regole dipendono dalla versione dell'API del piano (regola AC-L7): v0 resta quella di T0, identica.

   v0 (T0) — cosa sa guidare:
   - fasi a serie ("sets", o senza flow) e continue ("continuous"): voce per voce, serie per serie, nell'ordine dei dati;
   - voce a tempo (mode "timed" con dur > 0): preparazione (salvo subito dopo un riposo, o fra blocchi della stessa
     fase continua) + lavoro a tempo; voce a ripetizioni (mode "reps" con reps numerico > 0): lavoro a ripetizioni;
   - riposo dopo ogni serie se rest > 0, salvo l'ultima serie con noRestAfterLast; niente riposo prima di una nuova
     fase o della fine (lì c'è comunque una sosta);
   - lati (sides) e carichi come nei dati: li mostrano i componenti.
   v0 — cosa rende come passo libero (type "free"): una fase con un flow diverso da "sets"/"continuous" (un solo passo
   libero con l'intera fase, dopo il suo ingresso); una voce che non sa guidare (un passo libero per serie, + riposo).

   v1 — in più guida dai soli dati (lib/API-v1.md §5):
   - circuiti e superserie ("circuit"): giro per giro, voce per voce, a tempo e a ripetizioni misti; recupero della voce
     fra un esercizio e l'altro e, con roundRest, recupero di fine giro diverso per ogni giro (recupero decrescente);
   - intervalli e Tabata ("intervals", "tabata"): lavoro di phase.work s e recupero di phase.rest s per phase.rounds giri,
     una voce per giro a rotazione; preparazione solo prima del primo;
   - EMOM ("emom"): un passo "block" per intervallo (phase.every s, phase.rounds intervalli), che parte da solo allo scadere;
     AMRAP ("amrap") e For Time ("fortime"): un solo passo "block" per tutto il blocco;
   - voci per lato (perSide): per ogni serie, un passo per lato (preparazione prima di ogni lato a tempo), poi il recupero;
   - drop set (drops) e serie composte (parts): le parti della serie una dopo l'altra, senza riposo né preparazione;
   - ripetizioni a intervallo, "almeno N" e "max", tenute per ripetizione (hold): lavoro guidato;
   - recupero "a sensazione" (restText senza rest): passo di recupero con cronometro in avanti.
   v1 — passo libero solo per ciò che i dati non permettono di guidare: flow sconosciuto o blocco con numeri mancanti
   (un passo libero di fase), voce con modo sconosciuto o numeri mancanti (un passo libero per serie). */
(function (WP) {
  "use strict";
  const GUIDED_FLOWS = ["sets", "continuous"];

  function fallbackV0(w) {
    const { gate, prep, work, rest, free } = WP.api("v0").steps;
    const steps = [];
    w.phases.forEach((ph, pi) => {
      steps.push(gate({ pi }));
      const flow = ph.flow || "sets";
      if (!GUIDED_FLOWS.includes(flow)) { steps.push(free({ pi })); return; }
      ph.items.forEach((it, ii) => {
        const sets = Number.isInteger(it.sets) && it.sets > 0 ? it.sets : 1;
        for (let set = 1; set <= sets; set++) {
          const at = { pi, ii, set, sets, round: 0 };
          const prev = steps[steps.length - 1];
          if (!WP.isGuidedItem(it)) steps.push(free(at));
          else {
            if (it.mode === "timed" && prev.type !== "rest" && !(flow === "continuous" && ii > 0)) steps.push(prep(at));
            steps.push(work(at));
          }
          if (it.rest > 0 && !(it.noRestAfterLast && set === sets)) steps.push(rest(at));
        }
      });
      if (steps[steps.length - 1].type === "rest") steps.pop();
    });
    return steps;
  }

  function fallbackV1(w) {
    const { gate, prep, work, rest, free, block } = WP.api("v1").steps;
    const V = WP.v1, steps = [];
    const posInt = v => Number.isInteger(v) && v > 0;
    w.phases.forEach((ph, pi) => {
      steps.push(gate({ pi }));
      const flow = ph.flow || "sets";
      // una serie di una voce: lati × parti, poi il recupero
      const emitSet = (ii, set, sets, round) => {
        const it = ph.items[ii], base = { pi, ii, set, sets, round };
        if (!V.guided(ph, it)) steps.push(free(base));
        else {
          const sides = it.perSide ? it.sides.length : 1, units = V.unitsOf(it, set, sets);
          for (let side = 0; side < sides; side++) {
            units.forEach((u, part) => {
              const at = Object.assign({}, base, it.perSide ? { side } : {}, units.length > 1 ? { part } : {});
              const prev = steps[steps.length - 1];
              if (part === 0 && V.unitTimed(ph, it, u) && prev.type !== "rest" && !(flow === "continuous" && ii > 0) &&
                  !(V.INTERVAL_FLOWS.includes(flow) && round > 1)) steps.push(prep(at));
              steps.push(work(at));
            });
          }
        }
        if (V.hasRest(ph, ii, round) && !(it.noRestAfterLast && set === sets)) steps.push(rest(base));
      };
      if (flow === "sets" || flow === "continuous") {
        ph.items.forEach((it, ii) => {
          const sets = posInt(it.sets) ? it.sets : 1;
          for (let set = 1; set <= sets; set++) emitSet(ii, set, sets, 0);
        });
      } else if (flow === "circuit" && posInt(ph.rounds)) {
        for (let r = 1; r <= ph.rounds; r++) ph.items.forEach((_, ii) => emitSet(ii, 1, 1, r));
      } else if (V.INTERVAL_FLOWS.includes(flow) && V.intervalsOk(ph)) {
        for (let r = 1; r <= ph.rounds; r++) emitSet((r - 1) % ph.items.length, 1, 1, r);
      } else if (flow === "emom" && V.blockOk(ph)) {
        for (let r = 1; r <= ph.rounds; r++) steps.push(block({ pi, round: r }));
      } else if ((flow === "amrap" || flow === "fortime") && V.blockOk(ph)) {
        steps.push(block({ pi, round: 0 }));
      } else steps.push(free({ pi }));
      if (steps[steps.length - 1].type === "rest") steps.pop();
    });
    return steps;
  }

  // version: quella del piano (plan.api); senza, v0. Una versione sconosciuta (più recente) si legge con le regole più recenti.
  WP.fallbackSteps = function (w, version) {
    return (version || "v0") === "v0" ? fallbackV0(w) : fallbackV1(w);
  };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
