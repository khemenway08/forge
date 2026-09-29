const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const setup = require('../public/js/forge-artwork-template-setup.js');

test('artwork setup count parsing supports finite lists and ranges', () => {
  assert.deepEqual(setup.parseCounts('3-5, 8, 10'), [3, 4, 5, 8, 10]);
  assert.equal(setup.parseCounts('1-999').length, 250);
});

test('artwork setup UI exposes the three locked template types without path fields', () => {
  const source = fs.readFileSync('public/js/forge-artwork-template-setup.js', 'utf8');
  assert.match(source, /Single Master/);
  assert.match(source, /By Size/);
  assert.match(source, /By Personalization Position Count/);
  assert.match(source, /Set Up on Mac/);
  assert.match(source, /Validate Again on Mac/);
  assert.doesNotMatch(source, /approved_master_root|\/Users\//);
});

test('app integrates Artwork Template Setup into authenticated Admin Tools', () => {
  const app = fs.readFileSync('public/js/app.js', 'utf8');
  const index = fs.readFileSync('public/index.html', 'utf8');
  assert.match(app, /data-artwork-template-setup/);
  assert.match(app, /forgeArtworkTemplateSetup\.mount/);
  assert.match(index, /forge-artwork-template-setup\.js/);
});

test('launcher polling refreshes silently, stops on validation, and never relaunches setup', async () => {
  const registration = {
    registration_id: 'registration-tree',
    product_definition_id: 'tree_ornament',
    artwork_label: 'Tree Ornament',
    family_id: 'tree-ornament',
    launcher_family_id: 'tree-ornament',
    selector_type: 'size',
    allowed_variants: { small: 'Small', large: 'Large' },
    resolution_config: { filenames: { small: 'SMALL_MASTER.ai', large: 'LARGE_MASTER.ai' } },
    configuration_revision: 1,
    configuration_digest: 'a'.repeat(64),
    registration_status: 'inactive',
    validations: {}
  };
  let registrations = [registration];
  let setupRequests = 0;
  let intervalCallback = null;
  let clearedIntervals = 0;
  let renderCount = 0;
  let markup = '';
  const root = {};
  Object.defineProperty(root, 'innerHTML', {
    get: () => markup,
    set: (value) => { markup = value; renderCount += 1; }
  });
  const apiClient = {
    listArtworkTemplates: async () => ({ registrations }),
    createArtworkSetupToken: async () => {
      setupRequests += 1;
      return { setupUrl: `forge-artwork://setup?token=${'a'.repeat(64)}` };
    }
  };
  const originalWindow = global.window;
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  global.window = { location: { href: '' } };
  global.setInterval = (callback) => { intervalCallback = callback; return 7; };
  global.clearInterval = () => { clearedIntervals += 1; };
  try {
    setup.mount(root, {
      apiClient,
      productCatalog: { PRODUCT_DEFINITIONS: { tree: { definitionId: 'tree_ornament', displayName: 'Tree Ornament', category: 'ornament' } } }
    });
    await new Promise((resolve) => setImmediate(resolve));
    root.onclick({ target: { closest: () => ({ dataset: { artworkAction: 'validate', registrationId: 'registration-tree' } }) } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(setupRequests, 1);
    assert.match(global.window.location.href, /^forge-artwork:\/\/setup\?token=/);
    const rendersAfterLaunch = renderCount;
    await intervalCallback();
    assert.equal(renderCount, rendersAfterLaunch);
    assert.equal(setupRequests, 1);
    registrations = [{ ...registration, validations: { small: { validation_status: 'valid', configuration_revision: 1, configuration_digest: 'a'.repeat(64) } } }];
    await intervalCallback();
    assert.match(markup, /Artwork validation results received\./);
    assert.ok(clearedIntervals >= 1);
    assert.equal(setupRequests, 1);
  } finally {
    global.window = originalWindow;
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});
