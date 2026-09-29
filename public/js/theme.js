// Applies the visitor's saved theme before first paint, then wires the switcher.
// Loaded synchronously in <head> so there is no flash of the wrong theme.
(function () {
  var root = document.documentElement;
  var STORAGE_KEY = 'theme';
  var allowToggle = root.dataset.themeToggle === 'on';

  function readStored() {
    try {
      var value = localStorage.getItem(STORAGE_KEY);
      return value === 'light' || value === 'dark' || value === 'system' ? value : null;
    } catch (error) {
      return null;
    }
  }

  function apply(mode) {
    if (mode === 'light' || mode === 'dark') root.dataset.theme = mode;
    else root.removeAttribute('data-theme');
  }

  // Honour a previous choice only when the owner allows visitor selection.
  if (allowToggle) {
    var stored = readStored();
    if (stored !== null) apply(stored);
  }

  function currentMode() {
    var stored = readStored();
    if (stored !== null) return stored;
    var explicit = root.dataset.theme;
    return explicit === 'light' || explicit === 'dark' ? explicit : 'system';
  }

  function sync(switcher) {
    var mode = currentMode();
    switcher.querySelectorAll('[data-theme-value]').forEach(function (button) {
      button.setAttribute('aria-checked', button.dataset.themeValue === mode ? 'true' : 'false');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var switcher = document.querySelector('[data-theme-switcher]');
    if (switcher === null) return;
    var toggle = switcher.querySelector('.theme-switcher-toggle');

    function close() {
      switcher.classList.remove('is-open');
      if (toggle !== null) toggle.setAttribute('aria-expanded', 'false');
    }

    switcher.addEventListener('click', function (event) {
      var option = event.target.closest('[data-theme-value]');
      if (option !== null) {
        var value = option.dataset.themeValue;
        try {
          localStorage.setItem(STORAGE_KEY, value);
        } catch (error) {
          // Storage unavailable (private mode); the choice still applies now.
        }
        apply(value);
        close();
        sync(switcher);
        return;
      }
      if (event.target.closest('.theme-switcher-toggle') !== null) {
        var open = switcher.classList.toggle('is-open');
        if (toggle !== null) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
    });

    // Tapping outside closes the menu on touch devices.
    document.addEventListener('click', function (event) {
      if (!switcher.contains(event.target)) close();
    });

    sync(switcher);
  });
})();
