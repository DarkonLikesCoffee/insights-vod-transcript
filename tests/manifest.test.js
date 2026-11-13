'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('manifest configures a shared transcript page as the Side Panel', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.side_panel.default_path, 'transcript.html');
  assert.ok(manifest.permissions.includes('sidePanel'));
  assert.equal(manifest.action.default_popup, undefined);
});

test('every declared extension asset exists', () => {
  const declared = [
    manifest.background.service_worker,
    manifest.side_panel.default_path,
    ...manifest.content_scripts.flatMap(script => script.js),
    'popup.html',
    'popup.js',
    'transcript.css',
    'transcript-utils.js',
    'transcript.js'
  ];
  for (const asset of declared) {
    assert.ok(fs.existsSync(path.join(root, asset)), `Missing asset: ${asset}`);
  }
});

test('the transcript page loads its utility before the renderer', () => {
  const html = fs.readFileSync(path.join(root, 'transcript.html'), 'utf8');
  assert.ok(html.indexOf('transcript-utils.js') < html.indexOf('transcript.js'));
});

test('the embedded player loads shared parsing utilities before its listener', () => {
  const playerScript = manifest.content_scripts.find(script => script.js.includes('youtube-frame.js'));
  assert.deepEqual(playerScript.js, ['transcript-utils.js', 'youtube-frame.js']);
});
