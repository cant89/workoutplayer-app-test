/* WorkoutPlayer · motore: schermo sempre acceso durante la seduta (Wake Lock). Da src/app1.js:119-126. */
(function (WP) {
  "use strict";
  WP.modules.wakelock = function () {
    let wake = null;
    async function keepAwake(on) {
      try {
        if (on && navigator.wakeLock && document.visibilityState === "visible") wake = await navigator.wakeLock.request("screen");
        if (!on && wake) { await wake.release(); wake = null; }
      } catch (e) { /* non consentito: pazienza */ }
    }
    return { keepAwake };
  };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
