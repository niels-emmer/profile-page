// Progressive enhancement for the admin editor. All actions work without JS.

// Colour presets: fill the nearest form's colour fields.
document.addEventListener('click', (event) => {
  const button = event.target.closest('.preset');
  if (button === null) return;
  const form = button.closest('form');
  if (form === null) return;
  const from = form.querySelector('[name="colorFrom"]');
  const to = form.querySelector('[name="colorTo"]');
  const mode = form.querySelector('[name="colorMode"]');
  if (from !== null) from.value = button.dataset.from;
  if (to !== null) to.value = button.dataset.to;
  if (mode !== null) mode.value = 'gradient';
});

// Destructive actions ask for confirmation.
document.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-confirm]');
  if (form === null) return;
  if (!window.confirm(form.dataset.confirm)) event.preventDefault();
});

// Preview a chosen avatar before uploading.
const avatarInput = document.querySelector('input[name="avatar"]');
const avatarPreview = document.querySelector('.admin-avatar');
if (avatarInput !== null && avatarPreview !== null) {
  avatarInput.addEventListener('change', () => {
    const file = avatarInput.files && avatarInput.files[0];
    if (!file) return;
    avatarPreview.src = URL.createObjectURL(file);
  });
}
