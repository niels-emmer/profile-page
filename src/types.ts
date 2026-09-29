/** Domain types shared across the app. */

export interface Profile {
  name: string;
  tagline: string;
  description: string;
  /** Path under /assets/uploads, or null to use the bundled default avatar. */
  avatarPath: string | null;
}

export type IconType = 'fa' | 'image';
export type ColorMode = 'solid' | 'gradient';

export interface Link {
  id: number;
  position: number;
  text: string;
  url: string;
  newWindow: boolean;
  iconType: IconType;
  /** Font Awesome class (e.g. "fa-brands fa-github") or an upload path. */
  iconValue: string;
  iconColor: string | null;
  textColor: string;
  colorMode: ColorMode;
  colorFrom: string;
  colorTo: string;
  /** Optional 1px border colour (e.g. a white button on a light background). */
  borderColor: string | null;
}

/** A link as submitted by the admin form (no id/position yet). */
export type NewLink = Omit<Link, 'id' | 'position'>;

export type BackgroundSize = 'cover' | 'contain' | 'stretch' | 'auto';
export type BackgroundPosition =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top left'
  | 'top right'
  | 'bottom left'
  | 'bottom right';
export type BackgroundRepeat = 'no-repeat' | 'repeat';
export type BackgroundAttachment = 'scroll' | 'fixed';

/** Per-theme background image and how it is placed. */
export interface BackgroundSettings {
  /** Path under /assets/uploads, or null for no image. */
  imagePath: string | null;
  size: BackgroundSize;
  position: BackgroundPosition;
  repeat: BackgroundRepeat;
  attachment: BackgroundAttachment;
  /** Solid colour behind the image (hex), or null to use the theme base. */
  color: string | null;
  /** Image opacity, 0-100. Lower values let the colour show through. */
  opacity: number;
}

/** Which colour scheme the page shows: forced light/dark, or the visitor's OS. */
export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeSettings {
  /** Base colour/gradient layer, shown beneath any background image. */
  backgroundDark: string;
  backgroundLight: string;
  textDark: string;
  textLight: string;
  accentColor: string;
  faviconPath: string;
  /** Uploaded social preview image (1200×630), or null to fall back to the avatar. */
  ogImagePath: string | null;
  backgroundImageDark: BackgroundSettings;
  backgroundImageLight: BackgroundSettings;
  /** The site default when a visitor has not chosen a theme themselves. */
  defaultMode: ThemeMode;
  /** Whether visitors may override the theme with the on-page switcher. */
  visitorToggle: boolean;
}

/** A personal seed file: replaces the profile, theme, and all links. */
export interface SeedFile {
  profile: Profile;
  theme: ThemeSettings;
  links: NewLink[];
}
