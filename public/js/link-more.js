// Progressive enhancement for the touch link-details sheet.
//
// The sheet is pure CSS: the info trigger links to #link-more-<id>, :target
// reveals the card as a fixed bottom sheet, and the close/backdrop links clear
// the fragment. This script adds only what CSS cannot — moving focus into the
// sheet, restoring it on close, and letting Escape dismiss it. With JS disabled
// the sheet still opens and closes.
(function () {
  if (window.matchMedia && !window.matchMedia('(hover: none)').matches) return;

  var triggers = document.querySelectorAll('.link-more-trigger');
  if (triggers.length === 0) return;

  var lastTrigger = null;

  function activeCard() {
    var hash = location.hash;
    if (hash.indexOf('#link-more-') !== 0) return null;
    var card = document.getElementById(hash.slice(1));
    return card !== null && card.classList.contains('link-hover-card') ? card : null;
  }

  function sync() {
    var card = activeCard();
    if (card !== null) {
      card.focus();
    } else if (lastTrigger !== null) {
      lastTrigger.focus();
      lastTrigger = null;
    }
  }

  triggers.forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      lastTrigger = trigger;
    });
  });

  window.addEventListener('hashchange', sync);
  if (activeCard() !== null) {
    sync();
  }

  // Escape clears the fragment, which hides the sheet through :target.
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && activeCard() !== null) {
      location.hash = '';
    }
  });
})();
