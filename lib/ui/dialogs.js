/* WorkoutPlayer · componente: dialog (scaletta, audio e tempi, uscita) e stato dei selettori delle impostazioni.
   Da src/app3.js:86-90. Il contenuto dei dialog sta in lib/shell.html.
   T2 (AC-P4'): se la voce nella lingua del piano non c'è (lingua fuori dalle cinque, o il browser elenca le sue voci e
   nessuna è in quella lingua), le impostazioni audio lo dicono sotto "Voce"; il player usa solo bip e testo. */
(function (WP) {
  "use strict";
  WP.modules.dialogs = function (R) {
    const { $ } = WP.util;
    const openDlg = d => { try { d.showModal(); } catch (e) { d.setAttribute("open", ""); } };
    const closeDlg = d => { try { d.close(); } catch (e) { d.removeAttribute("open"); } };
    // nome della lingua del piano (senza il paese) nella lingua dell'interfaccia ("francese", "French"), o il codice se il browser non lo sa dire
    function planLangName() {
      const l = String(R.plan.lang || "").split("-")[0];
      try { return new Intl.DisplayNames([R.lang], { type: "language" }).of(l) || l; } catch (e) { return l; }
    }
    function paintVoiceNote() {
      const status = R.voiceStatus(), row = document.querySelector('#dlgAudio [data-set="voice"]');
      let note = $("voiceNote");
      if (status !== "noPhrases" && status !== "noVoice") { if (note) note.remove(); return; }
      if (!row) return;
      if (!note) { note = document.createElement("p"); note.className = "fine"; note.id = "voiceNote"; row.closest(".set-row").after(note); }
      note.textContent = R.t("audio.noVoice", { lang: planLangName() });
    }
    function paintSettings() {
      document.querySelectorAll(".seg").forEach(seg => [...seg.children].forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.v) === Number(R.S.settings[seg.dataset.set])))));
      paintVoiceNote();
    }
    return { openDlg, closeDlg, paintSettings, planLangName };
  };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
