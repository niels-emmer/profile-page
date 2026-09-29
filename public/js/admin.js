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

/* ------------------------- social preview image ------------------------- */

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/** Shrink the font until the text fits the card, then draw it. */
function drawFittedText(ctx, text, x, y, maxWidth, weight, startSize, minSize) {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px Inter, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth || size <= minSize) break;
    size -= 4;
  } while (size > minSize);
  if (ctx.measureText(text).width > maxWidth) {
    // Truncate with an ellipsis as a last resort.
    let truncated = text;
    while (truncated.length > 0 && ctx.measureText(`${truncated}…`).width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    ctx.fillText(`${truncated}…`, x, y);
    return;
  }
  ctx.fillText(text, x, y);
}

/** Render the profile card on a canvas and upload it as the preview image. */
async function generateOgImage(button) {
  const accent = button.dataset.accent || '#0085ff';
  const textColor = button.dataset.textColor || '#ffffff';
  const name = button.dataset.name || '';
  const tagline = button.dataset.tagline || '';
  const avatarSrc = button.dataset.avatar || '/assets/default-avatar.svg';

  // Inter is loaded via CSS; wait for it so the card uses the site font. A
  // timeout guarantees the flow can never hang on font loading.
  try {
    await Promise.race([
      Promise.all([document.fonts.load('700 88px Inter'), document.fonts.load('400 44px Inter')]),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch (error) {
    // Fall back to the default sans-serif.
  }

  const canvas = document.createElement('canvas');
  canvas.width = OG_WIDTH;
  canvas.height = OG_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('Canvas is not supported.');

  // Background: the accent colour.
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);

  // Avatar as a circle on the left; drawn without it if it cannot load.
  const avatar = new Image();
  await new Promise((resolve) => {
    avatar.onload = resolve;
    avatar.onerror = resolve;
    avatar.src = avatarSrc;
  });
  const avatarSize = 220;
  const avatarX = 110;
  const avatarY = (OG_HEIGHT - avatarSize) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  ctx.restore();

  // Name and tagline to the right of the avatar.
  const textX = avatarX + avatarSize + 56;
  const maxWidth = OG_WIDTH - textX - 110;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = textColor;
  drawFittedText(ctx, name, textX, OG_HEIGHT / 2 - 44, maxWidth, 700, 88, 56);
  drawFittedText(ctx, tagline, textX, OG_HEIGHT / 2 + 64, maxWidth, 400, 44, 28);

  const blob = await canvasToBlob(canvas, 'image/png');
  if (blob === null) throw new Error('Could not encode the preview image.');
  const file = new File([blob], 'preview.png', { type: 'image/png' });
  const data = new FormData();
  data.set('csrf', button.dataset.csrf || '');
  data.set('ogimage', file, file.name);
  const response = await fetch('/admin/ogimage', { method: 'POST', body: data });
  window.location.href = response.redirected ? response.url : '/admin?ok=1';
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-generate-og]');
  if (button === null) return;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Generating…';
  try {
    await generateOgImage(button);
  } catch (error) {
    button.disabled = false;
    button.textContent = originalText;
    window.location.href = '/admin?error=' + encodeURIComponent('Could not generate the preview image.');
  }
});

/* --------------------------- icon type fields --------------------------- */

// Show only the icon fields that apply to the selected icon type, and relabel
// the shared icon-value field accordingly. Without JS everything stays visible.
document.querySelectorAll('form[data-icon-type-form]').forEach((form) => {
  const select = form.querySelector('[name="iconType"]');
  const label = form.querySelector('[data-icon-value-label]');
  const groups = form.querySelectorAll('[data-icon-fields]');
  if (select === null) return;
  const apply = () => {
    const type = select.value === 'image' ? 'image' : 'fa';
    groups.forEach((group) => {
      group.hidden = group.dataset.iconFields !== type;
    });
    if (label !== null) {
      label.textContent = type === 'image' ? 'Icon path' : 'Icon font-awesome code';
    }
  };
  select.addEventListener('change', apply);
  apply();
});

/* ------------------------------ icon upload ----------------------------- */

const ICON_MAX = 128;

/** Downscale to a sensible icon size and encode as WebP (JPEG fallback). */
async function processIcon(file) {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, ICON_MAX / Math.max(bitmap.width, bitmap.height));
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
  if (blob === null) throw new Error('Could not encode the icon.');
  const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], `icon.${extension}`, { type: blob.type });
}

// The upload button opens the hidden file picker.
document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-icon-upload-trigger]');
  if (trigger === null) return;
  const input = trigger.closest('[data-icon-upload]')?.querySelector('input[type="file"]');
  if (input !== null) input.click();
});

// Process the chosen file, upload it, and fill the icon path field.
document.addEventListener('change', async (event) => {
  const input = event.target.closest('[data-icon-upload-input]');
  if (input === null) return;
  const file = input.files && input.files[0];
  if (!file) return;
  const wrap = input.closest('[data-icon-upload]');
  const form = input.closest('form');
  if (wrap === null || form === null) return;
  const pathField = form.querySelector('[name="iconValue"]');
  const csrf = form.querySelector('[name="csrf"]');
  const status = wrap.querySelector('[data-icon-upload-status]');
  const trigger = wrap.querySelector('[data-icon-upload-trigger]');
  if (pathField === null || csrf === null) return;
  if (trigger !== null) {
    trigger.disabled = true;
    trigger.textContent = 'Uploading…';
  }
  if (status !== null) status.textContent = '';
  try {
    const processed = await processIcon(file);
    const data = new FormData();
    data.set('csrf', csrf.value);
    data.set('icon', processed, processed.name);
    const response = await fetch('/admin/icon', { method: 'POST', body: data });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result.path !== 'string') {
      throw new Error(result.error ?? 'Upload failed.');
    }
    pathField.value = result.path;
    if (status !== null) status.textContent = 'Uploaded.';
  } catch (error) {
    if (status !== null) {
      status.textContent = error instanceof Error ? error.message : 'Upload failed.';
    }
  } finally {
    if (trigger !== null) {
      trigger.disabled = false;
      trigger.textContent = 'Upload icon';
    }
    input.value = '';
  }
});
