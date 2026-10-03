import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderContactJson, renderVCard, renderWebFinger, vcardSlug } from '../src/contact.ts';
import type { Link, Profile } from '../src/types.ts';

const profile: Profile = {
  name: 'Alex Rivera',
  tagline: 'Designer and developer',
  description: 'Builds small, fast things.',
  avatarPath: '/assets/uploads/avatar.jpg',
};

const link: Link = {
  id: 1,
  position: 0,
  text: 'GitHub',
  url: 'https://github.com/example',
  newWindow: true,
  iconType: 'fa',
  iconValue: 'fa-brands fa-github',
  iconColor: null,
  textColor: '#ffffff',
  colorMode: 'solid',
  colorFrom: '#000000',
  colorTo: '#000000',
  borderColor: null,
};

test('vcardSlug produces a safe filename', () => {
  assert.equal(vcardSlug('Alex Rivera'), 'alex-rivera');
  assert.equal(vcardSlug('  '), 'contact');
  assert.equal(vcardSlug('Å. B/C'), 'a-b-c');
});

test('renderVCard emits a valid vCard 4.0 with the profile data', () => {
  const vcf = renderVCard(profile, [link], 'https://example.com', '2026-01-02 03:04:05');
  assert.match(vcf, /^BEGIN:VCARD\r\n/);
  assert.match(vcf, /\r\nVERSION:4\.0\r\n/);
  assert.match(vcf, /\r\nFN:Alex Rivera\r\n/);
  assert.match(vcf, /\r\nN:Rivera;Alex;;;\r\n/);
  assert.match(vcf, /\r\nTITLE:Designer and developer\r\n/);
  assert.match(vcf, /\r\nNOTE:Builds small\\, fast things\.\r\n/);
  assert.match(
    vcf,
    /\r\nPHOTO;MEDIATYPE=image\/jpeg:https:\/\/example\.com\/assets\/uploads\/avatar\.jpg\r\n/,
  );
  assert.match(vcf, /\r\nURL:https:\/\/github\.com\/example\r\n/);
  assert.match(vcf, /\r\nUID:https:\/\/example\.com\/\r\n/);
  assert.match(vcf, /\r\nREV:2026-01-02T03:04:05Z\r\n/);
  assert.match(vcf, /END:VCARD\r\n$/);
});

test('renderVCard escapes separators and folds long lines', () => {
  const vcf = renderVCard(
    { ...profile, name: 'A, B; C', description: 'x'.repeat(200) },
    [],
    'https://example.com',
  );
  assert.match(vcf, /FN:A\\, B\\; C/);
  assert.match(vcf, /\r\n /); // a folded continuation line
  for (const line of vcf.split('\r\n')) {
    assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
  }
});

test('renderVCard strips control characters so a URL cannot inject properties', () => {
  const evil: Link = { ...link, url: 'https://example.com/a\r\nEMAIL:attacker@example.com' };
  const vcf = renderVCard(profile, [evil], 'https://example.com');
  assert.ok(!vcf.split('\r\n').some((line) => line.startsWith('EMAIL:')));
  assert.match(vcf, /URL:https:\/\/example\.com\/aEMAIL:attacker@example\.com/);
});

test('renderVCard lists the profile URL before the links', () => {
  const vcf = renderVCard(profile, [link], 'https://example.com');
  // The profile page's own URL comes immediately before the profile's links.
  assert.match(vcf, /\r\nURL:https:\/\/example\.com\/\r\nURL:https:\/\/github\.com\/example\r\n/);

  // It is present even when the profile has no links.
  const solo = renderVCard(profile, [], 'https://example.com');
  assert.match(solo, /\r\nURL:https:\/\/example\.com\/\r\n/);
});

test('renderVCard includes configured identity facts', () => {
  const vcf = renderVCard(profile, [link], 'https://example.com', '2026-01-02 03:04:05', {
    alternateName: 'Zaph',
    jobTitle: 'Cloud Architect',
    worksFor: 'Rockstars',
    alumniOf: [],
    knowsAbout: [],
    email: 'me@example.com',
    telephone: '+31 6 1234',
  });
  assert.match(vcf, /\r\nROLE:Cloud Architect\r\n/);
  assert.match(vcf, /\r\nORG:Rockstars\r\n/);
  assert.match(vcf, /\r\nEMAIL:me@example\.com\r\n/);
  assert.match(vcf, /\r\nTEL:\+31 6 1234\r\n/);
});

test('renderVCard omits invalid contact details', () => {
  const vcf = renderVCard(profile, [], 'https://example.com', undefined, {
    alternateName: '',
    jobTitle: '',
    worksFor: '',
    alumniOf: [],
    knowsAbout: [],
    email: 'not-an-email',
    telephone: 'not a phone',
  });
  assert.doesNotMatch(vcf, /EMAIL:/);
  assert.doesNotMatch(vcf, /TEL:/);
});

test('renderContactJson includes identity facts and sameAs', () => {
  const data = JSON.parse(
    renderContactJson(profile, [link], 'https://example.com', {
      alternateName: 'Zaph',
      jobTitle: 'Cloud Architect',
      worksFor: 'Rockstars',
      alumniOf: ['TU Delft'],
      knowsAbout: ['Cloud'],
      email: 'me@example.com',
      telephone: '',
    }),
  ) as Record<string, unknown>;
  assert.equal(data['jobTitle'], 'Cloud Architect');
  assert.equal(data['worksFor'], 'Rockstars');
  assert.deepEqual(data['alumniOf'], ['TU Delft']);
  assert.deepEqual(data['knowsAbout'], ['Cloud']);
  assert.equal(data['email'], 'me@example.com');
  assert.deepEqual(data['sameAs'], ['https://github.com/example']);
});

test('renderWebFinger returns undefined for a malformed base URL', () => {
  assert.equal(renderWebFinger(profile, [], 'not a url', 'acct:me@example.com'), undefined);
});

test('renderContactJson summarises the profile', () => {
  const data = JSON.parse(renderContactJson(profile, [link], 'https://example.com')) as {
    name: string;
    url: string;
    avatar: string;
    vcard: string;
    links: Array<{ text: string; url: string }>;
  };
  assert.equal(data.name, 'Alex Rivera');
  assert.equal(data.url, 'https://example.com/');
  assert.equal(data.avatar, 'https://example.com/assets/uploads/avatar.jpg');
  assert.equal(data.vcard, 'https://example.com/contact.vcf');
  assert.deepEqual(data.links, [{ text: 'GitHub', url: 'https://github.com/example' }]);
});

test('renderWebFinger answers known resources and rejects others', () => {
  const accepted = renderWebFinger(profile, [link], 'https://example.com', 'acct:me@example.com');
  assert.ok(accepted !== undefined);
  const jrd = JSON.parse(accepted) as {
    subject: string;
    links: Array<{ rel: string; href: string }>;
  };
  assert.equal(jrd.subject, 'acct:me@example.com');
  assert.ok(jrd.links.some((l) => l.rel === 'http://webfinger.net/rel/profile-page'));
  assert.ok(jrd.links.some((l) => l.rel === 'me' && l.href === 'https://github.com/example'));

  assert.equal(renderWebFinger(profile, [], 'https://example.com', 'acct:someone@else.com'), undefined);
  assert.equal(renderWebFinger(profile, [], 'https://example.com', ''), undefined);
});

test('renderWebFinger echoes the requested resource as the subject', () => {
  const jrd = JSON.parse(
    renderWebFinger(profile, [], 'https://example.com', 'acct:alex-rivera@example.com') ?? '{}',
  ) as { subject: string };
  assert.equal(jrd.subject, 'acct:alex-rivera@example.com');
});
