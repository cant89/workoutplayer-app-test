/* WorkoutPlayer · motore: bip, voce, vibrazione. Da src/app1.js:80-117.
   La voce usa la lingua del piano (R.plan.lang, per esempio "it-IT").
   T2 (AC-P4'): le frasi della voce sono nella lingua del piano se è una delle cinque (R.voiceLang). Stato della voce:
   "ok" (il browser ha una voce in quella lingua), "unknown" (il browser non ha ancora elencato le sue voci: si parla
   con la lingua impostata, come l'artifact), "noVoice" (le voci ci sono e nessuna è in quella lingua, o niente sintesi),
   "noPhrases" (lingua del piano fuori dalle cinque). Con "noVoice" e "noPhrases" niente voce: bip e testo. */
(function (WP) {
  "use strict";
  WP.modules.audio = function (R) {
    const S = R.S;
    const lang = R.plan.lang || "it-IT", langRe = new RegExp("^" + lang.slice(0, 2), "i");
    let actx = null;
    function unlockAudio() {
      try {
        if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
        if (actx && actx.state === "suspended") actx.resume();
      } catch (e) { /* audio non disponibile */ }
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
    function voiceFor() {
      try {
        const synth = window.speechSynthesis; if (!synth) return { status: "noVoice" };
        const all = synth.getVoices() || [];
        if (!all.length) return { status: "unknown" };
        const v = all.find(x => langRe.test(x.lang));
        return v ? { status: "ok", voice: v } : { status: "noVoice" };
      } catch (e) { return { status: "noVoice" }; }
    }
    const voiceStatus = () => (R.voiceLang ? voiceFor().status : "noPhrases");
    function say(text) {
      if (!S.settings.voice || !R.voiceLang) return;
      try {
        const synth = window.speechSynthesis; if (!synth) return;
        const vf = voiceFor(); if (vf.status === "noVoice") return;
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang; u.rate = 1.02;
        if (vf.voice) u.voice = vf.voice;
        synth.speak(u);
      } catch (e) { /* voce non disponibile */ }
    }
    const hush = () => { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* ignora */ } };
    return { unlockAudio, tone, sfx, buzz, say, hush, voiceStatus };
  };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
