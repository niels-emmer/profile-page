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

export interface ThemeSettings {
  backgroundDark: string;
  backgroundLight: string;
  textDark: string;
  textLight: string;
  accentColor: string;
  faviconPath: string;
}

/** A personal seed file: replaces the profile, theme, and all links. */
export interface SeedFile {
  profile: Profile;
  theme: ThemeSettings;
  links: NewLink[];
}
