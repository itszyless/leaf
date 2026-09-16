const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('../scripts/setup').setup();
const { confinedPath } = require('../dashboard/server');
const root = path.resolve(__dirname, '../assets');
test('static files stay inside their public directory', () => {
  assert.equal(confinedPath(root, 'icons/edit.png'), path.join(root, 'icons/edit.png'));
  for (const input of ['../config.json', '%2e%2e%2fconfig.json', '..%5cconfig.json', '../assets-other/secret', '%ZZ', path.resolve(root, '../config.json')]) {
    assert.equal(confinedPath(root, input), null, input);
  }
});
