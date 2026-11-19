const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('index.html exists and is not empty', () => {
  assert.ok(html.length > 1000);
});

test('page has the Showtime title', () => {
  assert.match(html, /<title>[^<]*Showtime/);
});

test('page has the main containers and inputs', () => {
  for (const id of ['app', 'view', 'city', 'q']) {
    assert.ok(html.includes(`id="${id}"`), `missing element with id "${id}"`);
  }
});

test('inline JavaScript has no syntax errors', () => {
  const match = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(match, 'no inline <script> found');
  assert.doesNotThrow(() => new vm.Script(match[1]));
});

test('movie list is defined', () => {
  assert.match(html, /const movies\s*=\s*\[/);
});

test('Dockerfile exists', () => {
  assert.ok(fs.existsSync(path.join(root, 'Dockerfile')));
});
