/* WorkoutPlayer · motore: memoria locale (solo comodità su questo dispositivo). Da src/app1.js:1-14.
   La chiave viene dal piano (R.storageKey). T2: con R.settingsKey (l'app) le impostazioni audio (bip, voce,
   preparazione) stanno in una memoria comune a tutti i piani, sotto quella chiave; il resto resta del piano.
   T2 passo 9 (decisione del titolare, #56): il ritocco "−/+" del carico si tiene per esercizio come differenza dal carico in
   scheda (kgDiff, in kg), non più come carico assoluto (kg): così vale anche dove il carico in scheda cambia (settimane, altre
   sedute, voci dello stesso esercizio). La memoria salvata prima (kg) si converte una volta nella differenza dal carico in scheda
   della prima voce di quell'esercizio nel piano (esatta quando ogni esercizio ha un solo carico, come nel piano del titolare);
   se quella voce non ha un carico numerico, o l'esercizio non c'è più, il ritocco vecchio si scarta. */
(function (WP) {
  "use strict";
  WP.modules.store = function (R) {
    const KEY = R.storageKey, SKEY = R.settingsKey;
    const store = (() => {
      let data = { settings: { beep: 1, voice: 1, prep: 10 }, kgDiff: {}, last: {}, age: null, session: null };
      try {
        const raw = JSON.parse(localStorage.getItem(KEY) || "null");
        if (raw && typeof raw === "object") data = Object.assign(data, raw, { settings: Object.assign(data.settings, raw.settings || {}) });
        const shared = SKEY ? JSON.parse(localStorage.getItem(SKEY) || "null") : null;
        if (shared && typeof shared === "object") Object.assign(data.settings, shared);
      } catch (e) { /* storage non disponibile: si lavora in memoria */ }
      if (!data.kgDiff || typeof data.kgDiff !== "object") data.kgDiff = {};
      const old = data.kg && typeof data.kg === "object" ? data.kg : null;
      if (old) {
        const first = {};
        Object.keys(R.WORKOUTS).forEach(wid => R.WORKOUTS[wid].phases.forEach(ph => ph.items.forEach(it => { if (!(it.ex in first)) first[it.ex] = it.kg; })));
        Object.keys(old).forEach(ex => {
          const base = first[ex], v = old[ex];
          if (typeof base === "number" && typeof v === "number" && v !== base && !(ex in data.kgDiff)) data.kgDiff[ex] = Math.round((v - base) * 100) / 100;
        });
        delete data.kg;
      }
      const api = {
        get: () => data,
        save() {
          try {
            if (!SKEY) { localStorage.setItem(KEY, JSON.stringify(data)); return; }
            localStorage.setItem(KEY, JSON.stringify(Object.assign({}, data, { settings: undefined })));
            localStorage.setItem(SKEY, JSON.stringify(data.settings));
          } catch (e) { /* ignora */ }
        }
      };
      if (old) api.save(); // la conversione si salva subito: la memoria vecchia non si converte due volte
      return api;
    })();
    return { store, S: store.get() };
  };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
