/* WorkoutPlayer · motore: bip, voce, vibrazione. Da src/app1.js:80-117.
   La voce usa la lingua del piano (R.plan.lang, per esempio "it-IT").
   T2 (AC-P4'): le frasi della voce sono nella lingua del piano se è una delle cinque (R.voiceLang). Stato della voce:
   "ok" (il browser ha una voce in quella lingua), "unknown" (il browser non ha ancora elencato le sue voci),
   "noVoice" (le voci ci sono e nessuna è in quella lingua, o niente sintesi), "noPhrases" (lingua del piano fuori dalle
   cinque). Con "noVoice" e "noPhrases" niente voce: bip e testo.
   T2 passo 9 (#61, voce con accento inglese su un testo italiano): mai una frase senza una voce esplicita nella lingua del
   piano. Un'utterance senza voice usa "la voce predefinita più adatta" per il suo lang (MDN, SpeechSynthesisUtterance.voice),
   che su un telefono in inglese è spesso inglese; e Chrome elenca le voci solo dopo, con l'evento voiceschanged (MDN, Using
   the Web Speech API: "you have to wait for the event to fire"). Quindi:
   - all'apertura del player e al primo tocco (unlockAudio: "Inizia") si chiede l'elenco e si ascolta voiceschanged;
   - una frase detta mentre l'elenco non c'è ancora aspetta al massimo WAIT_MS; se in tempo arriva una voce giusta si dice,
     altrimenti si scarta (niente frasi vecchie dette in ritardo; la frase dopo la sostituisce);
   - fra le voci della lingua del piano si preferisce quella locale (localService: niente rete), poi quella predefinita
     (default), poi quella della stessa variante (it-IT per un piano it-IT);
   - "noVoice" con la voce accesa: solo bip e testo, e nel passo in corso un avviso, una volta sola (R.showVoiceNotice);
     il dialogo Audio dice lo stato e si aggiorna quando arriva l'elenco. */
(function (WP) {
  "use strict";
  const WAIT_MS = 1500; // attesa massima dell'elenco delle voci per una frase
  WP.modules.audio = function (R) {
    const S = R.S;
    const lang = R.plan.lang || "it-IT", langRe = new RegExp("^" + lang.slice(0, 2), "i");
    let actx = null, pending = null, listening = false, warned = false;
    function unlockAudio() {
      try {
        if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
        if (actx && actx.state === "suspended") actx.resume();
      } catch (e) { /* audio non disponibile */ }
      primeVoices();
    }
    function tone(freq, ms, when, gain) {
      if (!S.settings.beep || !actx) return;
      try {
        const t0 = actx.currentTime + (when || 0), o = actx.createOscillator(), g = actx.createGain();
        o.type = "square"; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain || 0.25, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
        o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + ms / 1000 + 0.05);
      } catch (e) { /* ignora */ }
    }
    const sfx = {
      tick: () => tone(740, 140),
      go: () => { tone(1175, 520); buzz([220]); },
      rest: () => { tone(880, 180); tone(587, 380, 0.2); buzz([120, 80, 120]); },
      done: () => { tone(784, 160); tone(988, 160, 0.18); tone(1319, 520, 0.36); buzz([150, 80, 150, 80, 300]); }
    };
    function buzz(p) { try { if (S.settings.beep && navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignora */ } }
    const synthOf = () => { try { return window.speechSynthesis || null; } catch (e) { return null; } };
    const tag = x => String(x || "").replace("_", "-").toLowerCase(); // Android a volte scrive "it_IT"
    // la voce della lingua del piano: locale prima, poi predefinita, poi della stessa variante; mai una voce di un'altra lingua
    function voiceFor() {
      const synth = synthOf(); if (!synth) return { status: "noVoice" };
      let all;
      try { all = synth.getVoices() || []; } catch (e) { return { status: "noVoice" }; }
      if (!all.length) return { status: "unknown" };
      const mine = all.filter(v => v && langRe.test(tag(v.lang)));
      if (!mine.length) return { status: "noVoice" };
      const score = v => (v.localService ? 4 : 0) + (v.default ? 2 : 0) + (tag(v.lang) === tag(lang) ? 1 : 0);
      return { status: "ok", voice: mine.reduce((a, b) => (score(b) > score(a) ? b : a)) };
    }
    const voiceStatus = () => (R.voiceLang ? voiceFor().status : "noPhrases");
    // chiede l'elenco delle voci e ascolta voiceschanged (una volta sola l'ascolto, la richiesta a ogni chiamata)
    function primeVoices() {
      const synth = synthOf(); if (!synth) return;
      try { synth.getVoices(); } catch (e) { /* ignora */ }
      if (listening) return;
      listening = true;
      try { if (synth.addEventListener) synth.addEventListener("voiceschanged", onVoices); else synth.onvoiceschanged = onVoices; } catch (e) { /* ignora */ }
    }
    function onVoices() {
      try { if (R.paintSettings) R.paintSettings(); } catch (e) { /* dialogo Audio non montato */ }
      if (!pending) return;
      const vf = voiceFor();
      if (vf.status === "unknown") return;
      const text = pending.text;
      dropPending();
      if (vf.status === "ok") speakNow(text, vf.voice); else missing();
    }
    function speakNow(text, voice) {
      try {
        const synth = synthOf();
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang; u.voice = voice; u.rate = 1.02;
        synth.speak(u);
      } catch (e) { /* voce non disponibile */ }
    }
    // voci elencate e nessuna nella lingua del piano: nel passo in corso un avviso, una volta sola
    function missing() {
      if (warned || !R.cur || !R.showVoiceNotice) return;
      warned = true;
      try { R.showVoiceNotice(); } catch (e) { /* ignora */ }
    }
    function dropPending() { if (pending) { if (typeof clearTimeout === "function") clearTimeout(pending.timer); pending = null; } }
    function say(text) {
      if (!S.settings.voice || !R.voiceLang) return;
      const synth = synthOf(); if (!synth) return;
      const vf = voiceFor();
      dropPending(); // una frase nuova sostituisce quella che aspettava
      if (vf.status === "ok") return speakNow(text, vf.voice);
      if (vf.status === "noVoice") return missing();
      primeVoices(); // "unknown": l'elenco non c'è ancora; la frase aspetta al massimo WAIT_MS, poi si scarta
      if (typeof setTimeout !== "function") return;
      const p = { text };
      p.timer = setTimeout(() => { if (pending === p) pending = null; }, WAIT_MS);
      pending = p;
    }
    const hush = () => { dropPending(); try { const synth = synthOf(); if (synth) synth.cancel(); } catch (e) { /* ignora */ } };
    primeVoices(); // all'apertura del player
    return { unlockAudio, tone, sfx, buzz, say, hush, voiceStatus, voiceFor };
  };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
