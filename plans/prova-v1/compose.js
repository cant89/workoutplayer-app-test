/* Script di composizione del piano "prova-v1" (API v1 della libreria WorkoutPlayer, lib/API-v1.md). Piano sintetico per le
   prove: usa ogni componente nuovo almeno una volta. Contratto: compose(plan, api) → { idSeduta: [passi] }; usa solo i dati
   ricevuti e api.steps; gira isolato (lib/engine/isolate.js). Nessun numero nei passi: solo indici.
   Regole di sequenza (le stesse che un allenatore si aspetta, scritte qui per esteso come esempio per chi genera gli script):
   - serie per lato: in ogni serie prima un lato poi l'altro, senza recupero fra i lati, poi il recupero della voce;
   - drop set e serie composta: le parti della serie una dopo l'altra, senza recupero né preparazione;
   - circuito: giro per giro; recupero di fine giro da phase.roundRest (decrescente), nessun recupero dopo l'ultimo giro;
   - Tabata e intervalli: lavoro / recupero per phase.rounds giri, preparazione solo prima del primo;
   - EMOM: un passo "block" per intervallo; AMRAP e For Time: un solo passo "block";
   - preparazione prima di ogni lavoro a tempo (e tenuta), salvo subito dopo un recupero. */
function compose(plan, api) {
  "use strict";
  const { gate, prep, work, rest, free, block } = api.steps;
  const isInt = v => Number.isInteger(v) && v > 0;

  function buildSteps(w) {
    const steps = [];
    const last = () => steps[steps.length - 1];
    w.phases.forEach((ph, pi) => {
      steps.push(gate({ pi }));
      const timed = it => it.mode === "timed" || it.hold != null || ph.flow === "tabata" || ph.flow === "intervals";
      const oneSet = (ii, set, sets, round, restSec) => {
        const it = ph.items[ii], at = { pi, ii, set, sets, round };
        if (it.mode === "text") { steps.push(free(at)); return; }
        const sides = it.perSide ? it.sides.length : 1;
        const parts = it.parts ? it.parts.length : it.drops && (it.dropOn === "all" || set === sets) ? 1 + it.drops.length : 1;
        for (let side = 0; side < sides; side++) {
          for (let part = 0; part < parts; part++) {
            const s = Object.assign({}, at, it.perSide ? { side } : {}, parts > 1 ? { part } : {});
            if (part === 0 && timed(it) && last().type !== "rest" && !((ph.flow === "tabata" || ph.flow === "intervals") && round > 1)) steps.push(prep(s));
            steps.push(work(s));
          }
        }
        if (restSec) steps.push(rest(at));
      };
      const itemRest = it => it.rest > 0 || !!it.restText; // a tempo, o "a sensazione" (restText): cronometro in avanti
      if (ph.flow === "circuit") {
        for (let r = 1; r <= ph.rounds; r++) {
          ph.items.forEach((it, ii) => {
            const lastItem = ii === ph.items.length - 1;
            const roundRest = lastItem && ph.roundRest ? ph.roundRest[r - 1] > 0 : itemRest(it);
            oneSet(ii, 1, 1, r, roundRest);
          });
        }
      } else if (ph.flow === "tabata" || ph.flow === "intervals") {
        for (let r = 1; r <= ph.rounds; r++) oneSet((r - 1) % ph.items.length, 1, 1, r, ph.rest > 0);
      } else if (ph.flow === "emom") {
        for (let r = 1; r <= ph.rounds; r++) steps.push(block({ pi, round: r }));
      } else if (ph.flow === "amrap" || ph.flow === "fortime") {
        steps.push(block({ pi, round: 0 }));
      } else {
        ph.items.forEach((it, ii) => {
          const sets = isInt(it.sets) ? it.sets : 1;
          for (let set = 1; set <= sets; set++) oneSet(ii, set, sets, 0, itemRest(it) && !(it.noRestAfterLast && set === sets));
        });
      }
      // niente recupero prima di una nuova fase o della fine
      if (last().type === "rest") steps.pop();
    });
    return steps;
  }

  const out = {};
  Object.keys(plan.workouts).forEach(id => { out[id] = buildSteps(plan.workouts[id]); });
  return out;
}
