'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const scripts = new Set([
  manifest.background.service_worker,
  'popup.js',
  ...manifest.content_scripts.flatMap(entry => entry.js)
]);

test('all extension JavaScript files parse successfully', () => {
  for (const script of scripts) {
    const source = fs.readFileSync(path.join(root, script), 'utf8');
    assert.doesNotThrow(() => new vm.Script(source, { filename: script }), script);
  }
});
