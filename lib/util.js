/* WorkoutPlayer · utilità pure: formattazione e accesso al DOM. Da src/app1.js:19-26.
   Ogni file della libreria si registra sull'oggetto globale WorkoutPlayer; il punto d'ingresso è lib/index.js. */
(function (WP) {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = sec => { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), s = sec % 60; return m + ":" + String(s).padStart(2, "0"); };
  const fmtKg = (v, sep) => String(v).replace(".", sep == null ? "," : sep); // separatore dei decimali della lingua (T2)
  const durText = sec => (sec >= 60 ? (sec % 60 ? fmt(sec) + " min" : sec / 60 + " min") : sec + " s");
  WP.modules = WP.modules || {};
  WP.util = { $, esc, fmt, fmtKg, durText };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
