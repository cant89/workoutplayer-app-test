/* WorkoutPlayer · componenti: eventi dell'interfaccia (tocchi, impostazioni, carico, salti, età, visibilità).
   Da src/app3.js:97-132. Il carico "−/+" lo calcola il motore (R.changeKg, lib/engine/session.js): passo dell'attrezzo dai dati
   (plan.kgStep, 1 kg se manca); dal T2 passo 9 il ritocco si tiene come differenza dal carico in scheda (S.kgDiff, #56).
   T2: ripetizioni fatte (data-reps) e serie aggiunte o tolte (data-sets), solo con le opzioni dell'app. I tocchi che ridisegnano
   il passo senza cambiarlo lasciano il pulsante toccato dove era sullo schermo (R.keepPlace); prima "+ Serie" riportava in cima. */
(function (WP) {
  "use strict";
  WP.modules.events = function (R) {
    const { $ } = WP.util;
    const S = R.S;
    function wireEvents() {
      document.addEventListener("click", e => {
        const t = e.target.closest("button"); if (!t) return;
        if (t.dataset.w) return R.renderPreview(t.dataset.w);
        if (t.hasAttribute("data-close")) return R.closeDlg(t.closest("dialog"));
        if (t.parentElement.classList.contains("seg")) {
          S.settings[t.parentElement.dataset.set] = Number(t.dataset.v); R.store.save(); R.paintSettings();
          if (t.parentElement.dataset.set === "beep" && S.settings.beep) { R.unlockAudio(); R.sfx.tick(); }
          if (t.parentElement.dataset.set === "voice") { if (S.settings.voice) R.say(WP.i18n.t(R.voiceLang || R.lang, "voice.on")); else R.hush(); }
          return;
        }
        if (!R.cur) return;
        R.unlockAudio();
        if (t.dataset.adj) { R.adjust(Number(t.dataset.adj)); R.paintClock(R.remainingMs()); return; }
        if (t.dataset.act === "pause") return R.keepPlace(t, R.togglePause);
        if (t.dataset.act === "round") return R.keepPlace(t, R.addRound);
        if (t.dataset.reps) return R.keepPlace(t, () => R.changeReps(Number(t.dataset.reps)));
        if (t.dataset.sets) return R.keepPlace(t, () => R.editSets(Number(t.dataset.sets)));
        if (t.dataset.kg) return R.keepPlace(t, () => R.changeKg(t.dataset.ex, Number(t.dataset.kg)));
        if (t.dataset.jump) { R.closeDlg($("dlgList")); return R.enter(Number(t.dataset.jump)); }
      });
      $("stage").addEventListener("input", e => {
        if (e.target.id !== "age") return;
        const v = parseInt(e.target.value, 10); S.age = v >= 10 && v <= 99 ? v : null; R.store.save(); R.paintAge();
      });
      $("pvBack").onclick = () => { R.renderHome(); R.show("home"); };
      $("pvAudio").onclick = $("btnAudio").onclick = () => { R.paintSettings(); R.openDlg($("dlgAudio")); };
      $("btnList").onclick = () => { R.renderList(); R.openDlg($("dlgList")); };
      $("btnExit").onclick = () => R.openDlg($("dlgExit"));
      $("exitYes").onclick = () => { R.closeDlg($("dlgExit")); R.leave(); };
      $("btnMain").onclick = () => { R.unlockAudio(); R.enter(R.cur.idx + 1); };
      $("btnNext").onclick = () => R.enter(R.cur.idx + 1);
      $("btnPrev").onclick = () => R.enter(R.cur.idx - 1, { back: true });
      $("doneHome").onclick = () => { R.renderHome(); R.show("home"); };
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && R.cur) { R.keepAwake(true); R.tick(); } });
      try { window.speechSynthesis && window.speechSynthesis.getVoices(); } catch (e) { /* ignora */ }
    }
    return { wireEvents };
  };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
