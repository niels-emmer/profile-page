/** Colour helpers for the admin editor. */

export interface ColorScheme {
  name: string;
  from: string;
  to: string;
}

/** The seven button presets offered in the link editor. */
export const COLOR_SCHEMES: ColorScheme[] = [
  { name: 'Blue', from: '#0085ff', to: '#0085ff' },
  { name: 'Purple', from: '#6364ff', to: '#563acc' },
  { name: 'Red', from: '#e0245e', to: '#e0245e' },
  { name: 'Sunset', from: '#ff8a00', to: '#e52e71' },
  { name: 'Green', from: '#11998e', to: '#38ef7d' },
  { name: 'Ocean', from: '#00c6ff', to: '#0072ff' },
  { name: 'Graphite', from: '#232526', to: '#414345' },
];

function parseHex(hex: string): [number, number, number] | undefined {
  const value = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    const r = Number.parseInt(value[0]! + value[0]!, 16);
    const g = Number.parseInt(value[1]! + value[1]!, 16);
    const b = Number.parseInt(value[2]! + value[2]!, 16);
    return [r, g, b];
  }
  if (/^[0-9a-fA-F]{6}$/.test(value)) {
    return [
      Number.parseInt(value.slice(0, 2), 16),
      Number.parseInt(value.slice(2, 4), 16),
      Number.parseInt(value.slice(4, 6), 16),
    ];
  }
  return undefined;
}

/** Pick black or white text for legibility on the given background colour. */
export function readableTextColor(hex: string): string {
  const rgb = parseHex(hex);
  if (rgb === undefined) return '#ffffff';
  const [r, g, b] = rgb;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#222222' : '#ffffff';
}

/** Lighten (positive percent) or darken (negative percent) a hex colour. */
export function shade(hex: string, percent: number): string {
  const rgb = parseHex(hex);
  if (rgb === undefined) return hex;
  const adjust = (channel: number): number =>
    Math.max(0, Math.min(255, Math.round(channel + (percent / 100) * 255)));
  return `#${rgb
    .map((channel) => adjust(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

export function generateGradient(from: string, to: string): string {
  return `linear-gradient(45deg, ${from} 0%, ${to} 100%)`;
}
