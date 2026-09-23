/* WorkoutPlayer · motore: memoria locale (solo comodità su questo dispositivo). Da src/app1.js:1-14.
   La chiave viene dal piano (R.storageKey). T2: con R.settingsKey (l'app) le impostazioni audio (bip, voce,
   preparazione) stanno in una memoria comune a tutti i piani, sotto quella chiave; il resto resta del piano. */
(function (WP) {
  "use strict";
  WP.modules.store = function (R) {
    const KEY = R.storageKey, SKEY = R.settingsKey;
    const store = (() => {
      let data = { settings: { beep: 1, voice: 1, prep: 10 }, kg: {}, last: {}, age: null, session: null };
      try {
        const raw = JSON.parse(localStorage.getItem(KEY) || "null");
        if (raw && typeof raw === "object") data = Object.assign(data, raw, { settings: Object.assign(data.settings, raw.settings || {}) });
        const shared = SKEY ? JSON.parse(localStorage.getItem(SKEY) || "null") : null;
        if (shared && typeof shared === "object") Object.assign(data.settings, shared);
      } catch (e) { /* storage non disponibile: si lavora in memoria */ }
      return {
        get: () => data,
        save() {
          try {
            if (!SKEY) { localStorage.setItem(KEY, JSON.stringify(data)); return; }
            localStorage.setItem(KEY, JSON.stringify(Object.assign({}, data, { settings: undefined })));
            localStorage.setItem(SKEY, JSON.stringify(data.settings));
          } catch (e) { /* ignora */ }
        }
      };
    })();
    return { store, S: store.get() };
  };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
