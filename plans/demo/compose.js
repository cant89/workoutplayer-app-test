/* Script di composizione del piano "demo" (prova di domanda: dati e logica generici, nessun nome di persona). API v0 della libreria WorkoutPlayer, lib/API-v0.md.
   Contratto: compose(plan, api) → { idSeduta: [passi] }. È buildSteps dell'artifact (src/app1.js:45-65) riscritto
   contro l'API: usa solo i dati ricevuti e api.steps.gate/prep/work/rest; gira isolato (lib/engine/isolate.js).
   Rispetto al rendering di riserva aggiunge il circuito a giri (flow "circuit"): 3 giri × 4 esercizi, ciascuno
   con la sua preparazione, invece di un unico passo libero. */
function compose(plan, api) {
  "use strict";
  const { gate, prep, work, rest } = api.steps;

  function buildSteps(w) {
    const steps = [];
    w.phases.forEach((ph, pi) => {
      steps.push(gate({ pi }));
      const add = (ii, set, sets, round) => {
        const item = ph.items[ii];
        const prev = steps[steps.length - 1];
        const at = { pi, ii, set, sets, round };
        if (item.mode === "timed" && prev.type !== "rest" && !(ph.flow === "continuous" && ii > 0)) steps.push(prep(at));
        steps.push(work(at));
        if (item.rest > 0 && !(item.noRestAfterLast && set === sets)) steps.push(rest(at));
      };
      if (ph.flow === "circuit") {
        for (let r = 1; r <= ph.rounds; r++) ph.items.forEach((_, ii) => add(ii, 1, 1, r));
      } else {
        ph.items.forEach((it, ii) => { for (let s = 1; s <= it.sets; s++) add(ii, s, it.sets, 0); });
      }
      // niente riposo a timer prima di una nuova fase o della fine: lì ci si ferma comunque
      if (steps[steps.length - 1].type === "rest") steps.pop();
    });
    return steps;
  }

  const out = {};
  Object.keys(plan.workouts).forEach(id => { out[id] = buildSteps(plan.workouts[id]); });
  return out;
}
