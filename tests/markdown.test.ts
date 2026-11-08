import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderMarkdown } from '../src/markdown.ts';

test('renderMarkdown turns blank input into nothing', () => {
  assert.equal(renderMarkdown(''), '');
  assert.equal(renderMarkdown('   \n\n  '), '');
});

test('renderMarkdown renders paragraphs and line breaks', () => {
  const html = renderMarkdown('First line\nsecond line\n\nSecond paragraph');
  assert.equal(html, '<p>First line<br>\nsecond line</p>\n<p>Second paragraph</p>');
});

test('renderMarkdown renders bold and both italic markers', () => {
  assert.equal(renderMarkdown('**bold**'), '<p><strong>bold</strong></p>');
  assert.equal(renderMarkdown('*italic*'), '<p><em>italic</em></p>');
  assert.equal(renderMarkdown('_italic_'), '<p><em>italic</em></p>');
  assert.equal(
    renderMarkdown('**bold** and _italic_ and *also*'),
    '<p><strong>bold</strong> and <em>italic</em> and <em>also</em></p>',
  );
});

test('renderMarkdown leaves snake_case underscores alone', () => {
  assert.equal(renderMarkdown('snake_case_name'), '<p>snake_case_name</p>');
});

test('renderMarkdown renders unordered, ordered, and mixed lists', () => {
  assert.equal(
    renderMarkdown('- one\n- two'),
    '<ul>\n<li>one</li>\n<li>two</li>\n</ul>',
  );
  assert.equal(
    renderMarkdown('1. first\n2. second'),
    '<ol>\n<li>first</li>\n<li>second</li>\n</ol>',
  );
  assert.equal(
    renderMarkdown('Intro\n\n* a\n\n1. b'),
    '<p>Intro</p>\n<ul>\n<li>a</li>\n</ul>\n<ol>\n<li>b</li>\n</ol>',
  );
});

test('renderMarkdown renders horizontal rules', () => {
  assert.equal(renderMarkdown('above\n\n---\n\nbelow'), '<p>above</p>\n<hr>\n<p>below</p>');
  assert.equal(renderMarkdown('***'), '<hr>');
});

test('renderMarkdown renders inline code literally, including markers', () => {
  assert.equal(
    renderMarkdown('Use `a * b` here'),
    '<p>Use <code>a * b</code> here</p>',
  );
});

test('renderMarkdown escapes raw HTML so it renders as text', () => {
  const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('renderMarkdown leaves markdown-link syntax inert', () => {
  const html = renderMarkdown('[x](javascript:alert(1))');
  assert.ok(!html.includes('<a'));
  assert.equal(html, '<p>[x](javascript:alert(1))</p>');
});

test('renderMarkdown leaves unclosed markers literal', () => {
  assert.equal(renderMarkdown('**unclosed'), '<p>**unclosed</p>');
  assert.equal(renderMarkdown('_unclosed'), '<p>_unclosed</p>');
  assert.equal(renderMarkdown('`unclosed'), '<p>`unclosed</p>');
});

test('renderMarkdown normalises CRLF input', () => {
  assert.equal(
    renderMarkdown('one\r\n- two\r\n- three'),
    '<p>one</p>\n<ul>\n<li>two</li>\n<li>three</li>\n</ul>',
  );
});

test('renderMarkdown keeps hostile-looking list text escaped', () => {
  const html = renderMarkdown('- <b onclick="x">hi</b>');
  assert.equal(html, '<ul>\n<li>&lt;b onclick=&quot;x&quot;&gt;hi&lt;/b&gt;</li>\n</ul>');
});

test('renderMarkdown does not let a NUL placeholder inject markup', () => {
  const html = renderMarkdown('\u00000\u0000 `<b>`');
  assert.ok(!html.includes('<b>'));
  assert.match(html, /&lt;b&gt;/);
});
