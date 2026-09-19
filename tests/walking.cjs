// First-person integration: real inputs, collision, held ink and perspective rays.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 700, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(pathToFileURL(path.join(__dirname, '../demos/index.html')).href + '?study=walk');
    await page.locator('[data-control=traffic]').uncheck();
    const state = () => page.evaluate(() => document.getElementById('fractal-hatching').fractalDemo.getHeld());
    const seed = () => page.evaluate(() => document.getElementById('fractal-hatching').fractalDemo.getFrameSeed());
    const initial = await state();
    assert.equal(initial.scene, 5);
    assert(initial.walkPose);
    assert(await page.locator('[data-control=zoom]').isDisabled());
    assert(await page.locator('[data-play-kind=zoom]').isDisabled());
    const initialSeed = await seed();
    await page.locator('canvas').focus();
    await page.keyboard.down('w');
    await page.waitForFunction(() => document.getElementById('fractal-hatching').fractalDemo.getHeld().walkPose.eye[2] < .51, null, { timeout: 20000 });
    await page.waitForTimeout(400);
    await page.keyboard.up('w');
    const wall = await state();
    assert(wall.walkPose.eye[2] >= .469, 'camera must stop outside the clock tower');
    assert.equal(wall.walkPose.eye[1], initial.walkPose.eye[1]);
    assert.equal(await seed(), initialSeed, 'walking must preserve stroke identities');
    // Moving focus away must release held keys, even without a keyup event.
    await page.keyboard.down('s');
    await page.waitForTimeout(350);
    await page.locator('[data-control=scene]').focus();
    await page.waitForTimeout(250);
    const stopped = await state();
    await page.waitForTimeout(250);
    assert.deepEqual((await state()).walkPose, stopped.walkPose);
    await page.keyboard.up('s');
    await page.locator('[data-walk-reset]').click();
    await page.waitForFunction(() => document.getElementById('fractal-hatching').fractalDemo.getHeld().walkPose.eye[2] === 3.05);
    assert.deepEqual((await state()).walkPose, initial.walkPose);
    await page.locator('[data-walk-capture]').click();
    await page.waitForFunction(() => document.pointerLockElement === document.querySelector('canvas'));
    await page.mouse.move(200, 200);
    await page.mouse.move(250, 210);
    await page.waitForFunction(() => document.getElementById('fractal-hatching').fractalDemo.getHeld().walkPose.yaw !== 0);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.pointerLockElement === null);
    await page.locator('[data-walk-reset]').click();
    await page.waitForFunction(() => document.getElementById('fractal-hatching').fractalDemo.getHeld().walkPose.yaw === 0);
    const canvas = await page.locator('canvas').boundingBox();
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width / 2 + 80, canvas.y + canvas.height / 2 - 20);
    await page.mouse.up();
    await page.waitForTimeout(160);
    const looked = await state();
    assert(looked.walkPose.yaw > initial.walkPose.yaw);
    assert(looked.walkPose.pitch > initial.walkPose.pitch);
    assert.equal(await seed(), initialSeed);
    // A touch-style movement button works without pointer lock or a keyboard.
    const button = await page.getByRole('button', { name: 'Walk backward', exact: true }).boundingBox();
    await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.up();
    await page.waitForTimeout(160);
    assert((await state()).walkPose.eye[2] > looked.walkPose.eye[2]);
    await page.locator('[data-walk-reset]').click();
    await page.waitForFunction(() => document.getElementById('fractal-hatching').fractalDemo.getHeld().walkPose.eye[2] === 3.05);
    if (process.env.WALK_CAPTURE) await page.screenshot({ path: process.env.WALK_CAPTURE, fullPage: true });
    await page.setViewportSize({ width: 360, height: 900 });
    await page.waitForTimeout(160);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (process.env.WALK_MOBILE_CAPTURE) await page.screenshot({ path: process.env.WALK_MOBILE_CAPTURE, fullPage: true });
    await page.locator('[data-control=scene]').selectOption('3');
    await page.waitForTimeout(160);
    assert.equal((await state()).walkPose, null);
    assert(await page.locator('[data-walk-panel]').isHidden());
    assert(await page.locator('[data-control=zoom]').isEnabled());
    await page.locator('[data-control=scene]').selectOption('5');
    await page.waitForTimeout(160);
    assert.deepEqual((await state()).walkPose, initial.walkPose);
    const ticks = await page.evaluate(() => document.getElementById('fractal-hatching').fractalDemo.tickTimes);
    assert(ticks.slice(1).every((t, i) => t - ticks[i] >= 99.9), 'complete walking frames remain held at 10 Hz');
    assert.equal(await page.evaluate(() => document.getElementById('fractal-hatching').fractalDemo.gl.getError()), 0);
    assert.deepEqual(errors, []);
    console.log('Walking: collision, keyboard, mouse capture, drag look, movement buttons, focus loss, seed stability, held frames and mobile layout passed.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
