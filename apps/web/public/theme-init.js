/* global window, document */
(function () {
  try {
    var pref = window.localStorage.getItem('mfg.theme');
    if (pref === 'light' || pref === 'dark') {
      document.documentElement.setAttribute('data-theme', pref);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  } catch {
    // localStorage bị chặn → giữ mặc định theo hệ thống.
  }
})();
