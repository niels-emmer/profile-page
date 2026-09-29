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

/* ------------------------- image resize / convert ------------------------- */

const FAVICON_SIZE = 512;
const BACKGROUND_MAX = 1920;

function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the image.'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Centre-crop to a square PNG so the favicon looks right at every size. */
async function processFavicon(file) {
  const bitmap = await loadBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = FAVICON_SIZE;
  canvas.height = FAVICON_SIZE;
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  canvas.getContext('2d').drawImage(bitmap, sx, sy, side, side, 0, 0, FAVICON_SIZE, FAVICON_SIZE);
  const blob = await canvasToBlob(canvas, 'image/png');
  if (blob === null) throw new Error('Could not encode the favicon.');
  return new File([blob], 'favicon.png', { type: 'image/png' });
}

/** Downscale to a sensible width and encode as WebP (JPEG fallback). */
async function processBackground(file) {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, BACKGROUND_MAX / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  let blob = await canvasToBlob(canvas, 'image/webp', 0.82);
  if (blob === null || blob.type !== 'image/webp') {
    blob = await canvasToBlob(canvas, 'image/jpeg', 0.85);
  }
  if (blob === null) throw new Error('Could not encode the background.');
  const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], `background.${extension}`, { type: blob.type });
}

// Intercept favicon/background uploads, process the file, then submit.
document.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-image-process]');
  if (form === null) return;
  const input = form.querySelector('input[type="file"]');
  const file = input !== null && input.files ? input.files[0] : null;
  if (!file) return;

  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  if (submit !== null) submit.disabled = true;
  try {
    const processed =
      form.dataset.imageProcess === 'favicon'
        ? await processFavicon(file)
        : await processBackground(file);
    const data = new FormData(form);
    data.set(input.name, processed, processed.name);
    const response = await fetch(form.action, { method: 'POST', body: data });
    window.location.href = response.redirected ? response.url : '/admin?ok=1';
  } catch {
    // Fall back to the raw upload; the server validates and caps it.
    form.submit();
  }
});

/* --------------------------- active nav section --------------------------- */

const navLinks = [...document.querySelectorAll('.admin-nav-link')];
if (navLinks.length > 0 && 'IntersectionObserver' in window) {
  const byId = new Map(
    navLinks.map((link) => [link.getAttribute('href')?.slice(1) ?? '', link]),
  );
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const link of navLinks) link.classList.remove('is-active');
        byId.get(entry.target.id)?.classList.add('is-active');
      }
    },
    { rootMargin: '-20% 0px -70% 0px' },
  );
  for (const id of byId.keys()) {
    const section = document.getElementById(id);
    if (section !== null) observer.observe(section);
  }
}

/* ---------------------------- drag to reorder ----------------------------- */

const linkList = document.querySelector('.link-list[data-reorder-url]');
if (linkList !== null) {
  let dragging = null;
  let pointerId = null;

  const cardAfter = (y) => {
    const cards = linkList.querySelectorAll('.link-card:not(.dragging)');
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) return card;
    }
    return null;
  };

  // The handle lives inside <summary>; stop its clicks from toggling the card.
  linkList.addEventListener('click', (event) => {
    if (event.target.closest('.drag-handle') !== null) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  linkList.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('.drag-handle');
    if (handle === null) return;
    const card = handle.closest('.link-card');
    if (card === null) return;
    event.preventDefault();
    dragging = card;
    pointerId = event.pointerId;
    card.classList.add('dragging');
    handle.setPointerCapture(pointerId);
  });

  linkList.addEventListener('pointermove', (event) => {
    if (dragging === null || event.pointerId !== pointerId) return;
    const after = cardAfter(event.clientY);
    if (after === null) linkList.appendChild(dragging);
    else linkList.insertBefore(dragging, after);
  });

  const finish = async (event) => {
    if (dragging === null || event.pointerId !== pointerId) return;
    const card = dragging;
    dragging = null;
    pointerId = null;
    card.classList.remove('dragging');
    const order = [...linkList.querySelectorAll('.link-card')]
      .map((element) => element.dataset.id)
      .join(',');
    try {
      await fetch(linkList.dataset.reorderUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ csrf: linkList.dataset.csrf, order }),
      });
    } catch {
      // Ignore; the Move up/down buttons remain available.
    }
  };

  linkList.addEventListener('pointerup', finish);
  linkList.addEventListener('pointercancel', finish);
}

/* ------------------------- background controls ---------------------------- */

// Keep the opacity percentage readout in sync with its slider.
document.querySelectorAll('.admin-field--range input[type="range"]').forEach((input) => {
  const output = input.closest('.admin-field--range')?.querySelector('.admin-range-value');
  if (!output) return;
  const update = () => {
    output.textContent = `${input.value}%`;
  };
  input.addEventListener('input', update);
  update();
});

// The background colour swatch only applies when its checkbox is on.
document.querySelectorAll('.admin-color-toggle').forEach((row) => {
  const checkbox = row.querySelector('input[type="checkbox"]');
  const color = row.querySelector('input[type="color"]');
  if (!checkbox || !color) return;
  const sync = () => {
    color.disabled = !checkbox.checked;
  };
  checkbox.addEventListener('change', sync);
  sync();
});
