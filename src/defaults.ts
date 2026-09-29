import type { BackgroundSettings, NewLink, Profile, SeedFile, ThemeSettings } from './types.ts';

/** Content shown by a freshly seeded, empty installation. */
export const DEFAULT_PROFILE: Profile = {
  name: 'Alex Rivera',
  tagline: 'Designer, developer, coffee enthusiast',
  description:
    'I build small, fast things for the web and write about what I learn along the way. Replace this with your own story in the admin editor.',
  avatarPath: null,
};

/** Default background placement: no image, filled and centred. */
export const DEFAULT_BACKGROUND: BackgroundSettings = {
  imagePath: null,
  size: 'cover',
  position: 'center',
  repeat: 'no-repeat',
  attachment: 'scroll',
  color: null,
  opacity: 100,
};

/** Default look: the dark/light gradient theme the app is designed around. */
export const DEFAULT_THEME: ThemeSettings = {
  backgroundDark: 'radial-gradient(circle, #151826 28%, #0d0f18 100%)',
  backgroundLight: '#ffffff',
  textDark: '#ffffff',
  textLight: '#222222',
  accentColor: '#0085ff',
  faviconPath: '/assets/favicon.png',
  ogImagePath: null,
  backgroundImageDark: { ...DEFAULT_BACKGROUND },
  backgroundImageLight: { ...DEFAULT_BACKGROUND },
  defaultMode: 'system',
  visitorToggle: false,
};

/** A representative set of links so a fresh install is not an empty page. */
export const DEFAULT_LINKS: NewLink[] = [
  {
    text: 'Website',
    url: 'https://example.com',
    newWindow: true,
    iconType: 'fa',
    iconValue: 'fa-solid fa-globe',
    iconColor: null,
    textColor: '#ffffff',
    colorMode: 'solid',
    colorFrom: '#0085ff',
    colorTo: '#0085ff',
    borderColor: null,
  },
  {
    text: 'GitHub',
    url: 'https://github.com/example',
    newWindow: true,
    iconType: 'image',
    iconValue: '/assets/icons/github.svg',
    iconColor: null,
    textColor: '#ffffff',
    colorMode: 'solid',
    colorFrom: '#24292f',
    colorTo: '#24292f',
    borderColor: null,
  },
  {
    text: 'LinkedIn',
    url: 'https://www.linkedin.com/in/example',
    newWindow: true,
    iconType: 'image',
    iconValue: '/assets/icons/linkedin.svg',
    iconColor: null,
    textColor: '#ffffff',
    colorMode: 'solid',
    colorFrom: '#2867b2',
    colorTo: '#2867b2',
    borderColor: null,
  },
  {
    text: 'Signal',
    url: 'https://signal.me/#example',
    newWindow: true,
    iconType: 'image',
    iconValue: '/assets/icons/signal.svg',
    iconColor: null,
    textColor: '#ffffff',
    colorMode: 'solid',
    colorFrom: '#3a76f0',
    colorTo: '#3a76f0',
    borderColor: null,
  },
  {
    text: 'Matrix',
    url: 'https://matrix.to/#/@example:example.com',
    newWindow: true,
    iconType: 'image',
    iconValue: '/assets/icons/matrix.svg',
    iconColor: null,
    textColor: '#ffffff',
    colorMode: 'solid',
    colorFrom: '#000000',
    colorTo: '#000000',
    borderColor: null,
  },
  {
    text: 'Email',
    url: 'https://example.com/contact',
    newWindow: false,
    iconType: 'fa',
    iconValue: 'fa-solid fa-envelope',
    iconColor: null,
    textColor: '#ffffff',
    colorMode: 'solid',
    colorFrom: '#6c5ce7',
    colorTo: '#6c5ce7',
    borderColor: null,
  },
];

/** Applied once, on first run, when the database has no profile yet. */
export const DEFAULT_SEED: SeedFile = {
  profile: DEFAULT_PROFILE,
  theme: DEFAULT_THEME,
  links: DEFAULT_LINKS,
};
