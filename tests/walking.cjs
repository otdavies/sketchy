// First-person integration: real inputs, collision, stable ink and perspective rays.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 480, height: 720 } });
  // Drive real animation callbacks with a controlled clock: GPU speed must not
  // decide how far a held key moves the camera before an assertion.
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(pathToFileURL(path.join(__dirname, '../demos/index.html')).href + '?study=walk');
    await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'));
    await page.locator('[data-control=traffic]').uncheck();
    await page.clock.runFor(120);
    const state = () => page.evaluate(() => document.getElementById('fractal-hatching').fractalDemo.getState());
    const seed = () => page.evaluate(() => document.getElementById('fractal-hatching').fractalDemo.getFrameSeed());
    const initial = await state();
    assert.equal(initial.scene, 5);
    assert(initial.walkPose);
    assert(await page.locator('[data-control=zoom]').isDisabled());
    assert(await page.locator('[data-play-kind=zoom]').isDisabled());
    const initialSeed = await seed();
    await page.locator('canvas').focus();
    await page.keyboard.down('w');
    await page.clock.runFor(4000);
    await page.keyboard.up('w');
    const wall = await state();
    assert(wall.walkPose.eye[2] < .51, 'walking reaches the tower');
    assert(wall.walkPose.eye[2] >= .469, 'camera must stop outside the clock tower');
    assert.equal(wall.walkPose.eye[1], initial.walkPose.eye[1]);
    assert.equal(await seed(), initialSeed, 'walking must preserve stroke identities');
    // Moving focus away must release held keys, even without a keyup event.
    await page.keyboard.down('s');
    await page.clock.runFor(350);
    assert((await state()).walkPose.eye[2] > wall.walkPose.eye[2], 'backward movement starts before focus loss');
    await page.locator('[data-control=scene]').focus();
    await page.clock.runFor(250);
    const stopped = await state();
    await page.clock.runFor(250);
    assert.deepEqual((await state()).walkPose, stopped.walkPose);
    await page.keyboard.up('s');
    await page.locator('[data-walk-reset]').click();
    await page.clock.runFor(120);
    assert.deepEqual((await state()).walkPose, initial.walkPose);
    await page.locator('[data-walk-capture]').click();
    await page.clock.runFor(120);
    assert(await page.evaluate(() => document.pointerLockElement === document.querySelector('canvas')));
    // Pointer lock consumes relative movement. Headless Chromium can report zero
    // movementX/Y for Playwright's absolute mouse positions while locked. Keep
    // real capture/release, but provide a known relative event to test mouse-look.
    await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', {
      movementX: 50, movementY: 10, bubbles: true,
    })));
    await page.clock.runFor(120);
    const capturedLook = (await state()).walkPose;
    assert(Math.abs(capturedLook.yaw - 50 * .0035) < 1e-9);
    assert(Math.abs(capturedLook.pitch - (initial.walkPose.pitch - 10 * .0035)) < 1e-9);
    await page.keyboard.press('Escape');
    await page.clock.runFor(120);
    assert(await page.evaluate(() => document.pointerLockElement === null));
    await page.locator('[data-walk-reset]').click();
    await page.clock.runFor(120);
    assert.equal((await state()).walkPose.yaw, 0);
    await page.locator('canvas').scrollIntoViewIfNeeded();
    const canvas = await page.locator('canvas').boundingBox();
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width / 2 + 80, canvas.y + canvas.height / 2 - 20);
    await page.mouse.up();
    await page.clock.runFor(120);
    const looked = await state();
    assert(looked.walkPose.yaw > initial.walkPose.yaw);
    assert(looked.walkPose.pitch > initial.walkPose.pitch);
    assert.equal(await seed(), initialSeed);
    // A touch-style movement button works without pointer lock or a keyboard.
    const backward = page.getByRole('button', { name: 'Walk backward', exact: true });
    await backward.scrollIntoViewIfNeeded();
    const button = await backward.boundingBox();
    await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
    await page.mouse.down();
    await page.clock.runFor(400);
    await page.mouse.up();
    assert((await state()).walkPose.eye[2] > looked.walkPose.eye[2]);
    await page.locator('[data-walk-reset]').click();
    await page.clock.runFor(120);
    if (process.env.WALK_CAPTURE) await page.screenshot({ path: process.env.WALK_CAPTURE, fullPage: true });
    await page.setViewportSize({ width: 360, height: 900 });
    await page.clock.runFor(160);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (process.env.WALK_MOBILE_CAPTURE) await page.screenshot({ path: process.env.WALK_MOBILE_CAPTURE, fullPage: true });
    await page.locator('[data-control=scene]').selectOption('3');
    await page.clock.runFor(120);
    assert.equal((await state()).scene, 3);
    assert.equal((await state()).walkPose, null);
    assert(await page.locator('[data-walk-panel]').isHidden());
    assert(await page.locator('[data-control=zoom]').isEnabled());
    await page.locator('[data-control=scene]').selectOption('5');
    await page.clock.runFor(120);
    assert.equal((await state()).scene, 5);
    assert.deepEqual((await state()).walkPose, initial.walkPose);
    assert.equal(await page.evaluate(() => document.getElementById('fractal-hatching').fractalDemo.gl.getError()), 0);
    assert.deepEqual(errors, []);
    console.log('Walking: collision, keyboard, mouse capture, drag look, movement buttons, focus loss, seed stability and mobile layout passed.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
