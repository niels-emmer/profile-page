// Progressive enhancement for the QR modal.
//
// The modal is pure CSS: the avatar links to #qr, :target reveals the overlay,
// and the close links (and backdrop) clear the fragment. This script adds only
// what CSS cannot — moving focus into the dialog, restoring it on close, and
// letting Escape dismiss it. With JS disabled the modal still opens and closes.
(function () {
  var modal = document.getElementById('qr');
  if (modal === null) return;

  var opener = document.querySelector('[data-qr-open]');
  var panel = modal.querySelector('.qr-modal-panel');
  var wasOpen = false;

  function focusPanel() {
    if (panel !== null) panel.focus();
  }

  function sync() {
    var nowOpen = location.hash === '#qr';
    if (nowOpen) {
      focusPanel();
    } else if (wasOpen && opener !== null) {
      opener.focus();
    }
    wasOpen = nowOpen;
  }

  window.addEventListener('hashchange', sync);
  if (location.hash === '#qr') {
    wasOpen = true;
    focusPanel();
  }

  // Escape clears the fragment, which hides the modal through :target.
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && location.hash === '#qr') {
      location.hash = '';
    }
  });
})();
