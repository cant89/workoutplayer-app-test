/* WorkoutPlayer · app: anteprima (T2, AC-V3-1 parte client). Solo logica, niente DOM (le viste la disegnano).
   Dai dati di un piano per la libreria costruisce ciò che un'anteprima conterrà in produzione (T3: lettura strutturale
   di tutto il documento + dati completi dei soli primi 2 esercizi):
   - plan: piano giocabile con i soli primi 2 esercizi della prima seduta (esercizi distinti, nell'ordine dei dati; le voci
     consecutive dello stesso esercizio restano insieme, per esempio i blocchi del tapis roulant), con numeri, istruzioni e
     ritagli di quei 2; il player lo guida con il rendering di riserva (niente script);
   - outline: tutte le sedute e le voci con il solo nome dell'esercizio (e quali sono giocabili): nessun numero né istruzione
     delle altre voci entra nel deposito, quindi nemmeno nella pagina;
   - coverage: stima di copertura dai dati con le regole della libreria (rendering di riserva): voci guidate e voci che
     usciranno come passo libero, con i nomi. Nessuna chiamata AI.
   - markKey: dove mettere, nel piano dell'anteprima, il segno "da verificare" di un valore incerto dei 2 esercizi giocabili. */
(function (App) {
  "use strict";
  const WP = () => globalThis.WorkoutPlayer;
  const MAX = 2;

  function costruisci(lib) {
    const wids = Object.keys(lib.workouts), wid = wids[0], w = lib.workouts[wid];
    const chosen = [], taken = new Set(), phases = [], phaseIndex = {};
    let stop = false;
    w.phases.forEach((ph, pi) => {
      if (stop) return;
      const items = [];
      for (let ii = 0; ii < ph.items.length; ii++) {
        const it = ph.items[ii];
        if (!chosen.includes(it.ex)) { if (chosen.length >= MAX) { stop = true; break; } chosen.push(it.ex); }
        items.push(it); taken.add(pi + "." + ii);
      }
      if (items.length) { phaseIndex[pi] = phases.length; phases.push(Object.assign({}, ph, { items })); }
    });
    const exercises = {}, kgStep = {};
    chosen.forEach(ex => { exercises[ex] = lib.exercises[ex]; if (lib.kgStep && lib.kgStep[ex] != null) kgStep[ex] = lib.kgStep[ex]; });
    const plan = {
      id: lib.id + "-preview", api: lib.api, title: lib.title, lang: lib.lang,
      storageKey: (lib.storageKey || "workoutplayer-" + lib.id) + "-preview",
      exercises, workouts: { [wid]: Object.assign({}, w, { phases }) }
    };
    if (lib.kicker) plan.kicker = lib.kicker;
    if (Object.keys(kgStep).length) plan.kgStep = kgStep;
    const name = it => (lib.exercises[it.ex] || {}).name || it.ex;
    const outline = wids.map(id => {
      const x = lib.workouts[id];
      return { id, title: x.title, focus: x.focus || "", letter: x.letter || "",
        phases: x.phases.map((ph, pi) => ({ title: ph.title, items: ph.items.map((it, ii) => ({ name: name(it), playable: id === wid && taken.has(pi + "." + ii) })) })) };
    });
    // voce del piano completo (seduta, fase, voce) → chiave del segno nel piano dell'anteprima, o null se non è nella prova
    const markKey = (wid2, pi, ii) => (wid2 !== wid || phaseIndex[pi] == null || (ii != null && !taken.has(pi + "." + ii)) ? null : wid + "/" + phaseIndex[pi] + (ii != null ? "/" + ii : ""));
    return { plan, outline, coverage: copertura(lib), chosen, markKey };
  }

  // voci guidate e voci che il player renderà come passo libero, con le regole della riserva della libreria
  function copertura(lib) {
    const R = WP().create({ plan: lib, images: {} });
    let items = 0;
    const free = [];
    Object.keys(lib.workouts).forEach(id => {
      const w = lib.workouts[id], steps = R.buildSteps(w);
      w.phases.forEach((ph, pi) => ph.items.forEach((it, ii) => {
        items++;
        const phaseSteps = steps.filter(s => s.pi === pi), mine = phaseSteps.filter(s => s.ii === ii);
        const guided = phaseSteps.some(s => s.type === "block") || mine.some(s => s.type !== "free");
        if (!guided) free.push((lib.exercises[it.ex] || {}).name || it.ex);
      }));
    });
    return { sessions: Object.keys(lib.workouts).length, items, exercises: Object.keys(lib.exercises).length, free: [...new Set(free)], freeCount: free.length };
  }

  App.anteprima = { costruisci, copertura, MAX };
})(globalThis.WorkoutPlayerApp = globalThis.WorkoutPlayerApp || {});
