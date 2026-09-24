/* WorkoutPlayer · app: deposito locale (T2). Il server non c'è ancora (T3): questo è il deposito temporaneo del dispositivo.
   - Piani in IndexedDB (database "workoutplayer", archivio "plans"), un record per piano:
       { id, kind: "plan" (piano) | "preview" (anteprima), source, title, lang, addedAt,
         lib: piano per la libreria (API v0/v1), compose: testo dello script o null, images: { nome: data URI },
         data: dati con provenienza e certezza (schema wp-plan/1) o null,            solo "plan"
         review: { fields: { chiave: { state, values, originals, at } }, confirmedAt } solo "plan"
         outline, coverage                                                          solo "preview" }
   - Impostazioni dell'app in localStorage ("workoutplayer-app": lingua, tema); impostazioni audio comuni a tutti i piani
     in "workoutplayer-audio" (le legge e scrive anche il player, opzione settingsKey). */
(function (App) {
  "use strict";
  const DB = "workoutplayer", STORE = "plans", VERSION = 1;
  const SETTINGS_KEY = "workoutplayer-app", AUDIO_KEY = "workoutplayer-audio";
  let dbp = null;
  function open() {
    if (!dbp) dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }
  async function run(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode), st = tx.objectStore(STORE), req = fn(st);
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  const all = () => run("readonly", st => st.getAll());
  const get = id => run("readonly", st => st.get(id));
  const put = rec => run("readwrite", st => st.put(rec));
  const del = id => run("readwrite", st => st.delete(id));

  function readJSON(key) { try { return JSON.parse(localStorage.getItem(key) || "null") || {}; } catch (e) { return {}; } }
  function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* memoria piena o non disponibile */ } }
  const settings = {
    get: () => Object.assign({ lang: "auto", theme: "auto" }, readJSON(SETTINGS_KEY)),
    set: patch => writeJSON(SETTINGS_KEY, Object.assign(settings.get(), patch))
  };
  // stesse impostazioni predefinite del player (lib/engine/store.js)
  const audio = {
    get: () => Object.assign({ beep: 1, voice: 1, prep: 10 }, readJSON(AUDIO_KEY)),
    set: patch => writeJSON(AUDIO_KEY, Object.assign(audio.get(), patch))
  };
  // la memoria del player per un piano (carichi ritoccati, ultima volta, seduta in corso, diario)
  const forgetPlayer = storageKey => { try { localStorage.removeItem(storageKey); } catch (e) { /* ignora */ } };
  // carichi ritoccati nel player ("−/+", memoria del piano: kg per esercizio, lib/engine/texts.js) che una correzione in revisione
  // ha superato: si tolgono, così il player mostra il carico corretto; gli altri ritocchi restano
  function forgetKg(storageKey, exercises) {
    const mem = readJSON(storageKey);
    if (!exercises.length || !mem.kg || !exercises.some(ex => ex in mem.kg)) return;
    exercises.forEach(ex => { delete mem.kg[ex]; });
    writeJSON(storageKey, mem);
  }

  App.deposito = { all, get, put, del, settings, audio, forgetPlayer, forgetKg, AUDIO_KEY };
})(globalThis.WorkoutPlayerApp = globalThis.WorkoutPlayerApp || {});
