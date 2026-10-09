import { test, expect } from '@playwright/test';

const drawn = (page) => expect(page.locator('#status')).toHaveText(/ms$/, { timeout: 15_000 });

/** Decode the previewed GIF with the browser's own decoder. */
const decodePreview = (page) =>
  page.evaluate(async () => {
    const src = document.getElementById('preview').src;
    const bytes = await (await fetch(src)).arrayBuffer();
    const decoder = new ImageDecoder({ data: bytes, type: 'image/gif' });
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    const { image } = await decoder.decode({ frameIndex: 0 });
    const out = {
      frames: track.frameCount,
      repetition: track.repetitionCount,
      width: image.displayWidth,
      height: image.displayHeight,
      duration: image.duration,
    };
    image.close();
    return out;
  });

test('the page opens on a drawn GIF, ready to download', async ({ page }) => {
  await page.goto('/');
  await drawn(page);
  const download = page.getByRole('link', { name: 'Download GIF' });
  await expect(download).toHaveAttribute('href', /^blob:/);
  await expect(download).toHaveAttribute('download', 'zomnbio-1.gif');
  await expect(page.locator('#preview')).toHaveAttribute('alt', /zomnbio/);
  const gif = await decodePreview(page);
  expect(gif).toMatchObject({ frames: 24, width: 300, height: 130 });
  expect(gif.repetition).toBe(Infinity);
  expect(gif.duration).toBe(90_000); // microseconds
});

test('the word typed in is the word drawn and the file named', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Word', { exact: true }).fill('VOID NET');
  await drawn(page);
  await expect(page.locator('#preview')).toHaveAttribute('alt', /VOID NET/);
  await expect(page.getByRole('link', { name: 'Download GIF' })).toHaveAttribute(
    'download',
    'void-net-1.gif'
  );
});

test('style, animation, effects, colours, lettering and canvas all reach the GIF', async ({
  page,
}) => {
  await page.goto('/');
  await drawn(page);
  await page.getByLabel('Style').selectOption({ label: 'Chrome' });
  await page.getByLabel('Animation').selectOption({ label: 'Bounce' });
  await page.getByRole('checkbox', { name: 'Decay' }).uncheck();
  await page.getByRole('checkbox', { name: 'Glint' }).check();
  await page.getByRole('checkbox', { name: 'Scanlines' }).check();
  await page.getByLabel('Face', { exact: true }).fill('#ff00aa');
  await page.getByLabel('Font').selectOption({ label: 'Bitmap 5×7' });
  await page.getByLabel('Width').fill('200');
  await page.getByLabel('Height').fill('80');
  await page.getByLabel('Frames').fill('10');
  await page.getByLabel('Frame ms').fill('50');
  await drawn(page);

  const gif = await decodePreview(page);
  expect(gif).toMatchObject({ frames: 10, width: 200, height: 80, duration: 50_000 });
  const hash = new URLSearchParams(page.url().split('#')[1]);
  expect(hash.get('style')).toBe('chrome');
  expect(hash.get('animation')).toBe('bounce');
  expect(hash.get('effects')).toBe('glint,scanlines');
  expect(hash.get('face')).toBe('#ff00aa');
  expect(hash.get('font')).toBe('bitmap');
  await expect(page.locator('#preview')).toHaveAttribute('alt', /chrome, bounce, glint, scanlines/);
});

test('every style, animation and effect can be picked', async ({ page }) => {
  await page.goto('/');
  await drawn(page);
  const styles = await page.locator('#style option').count();
  const animations = await page.locator('#animation option').count();
  const effects = await page.locator('#effects input').count();
  expect(styles).toBeGreaterThanOrEqual(7);
  expect(animations).toBeGreaterThanOrEqual(10);
  expect(effects).toBeGreaterThanOrEqual(9);
  for (let i = 0; i < styles; i++) {
    await page.locator('#style').selectOption({ index: i });
    await page.locator('#animation').selectOption({ index: i % animations });
    await drawn(page);
  }
  for (const box of await page.locator('#effects input').all()) await box.check();
  await drawn(page);
  expect((await decodePreview(page)).frames).toBe(24);
});

test('a preset fills the form but keeps the word and seed', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Word', { exact: true }).fill('hello');
  await page.getByLabel('Seed').fill('42');
  await page.getByRole('button', { name: 'Deep 3D' }).click();
  await drawn(page);
  await expect(page.getByLabel('Style')).toHaveValue('extrude');
  await expect(page.getByLabel('Animation')).toHaveValue('rock');
  await expect(page.getByLabel('Word', { exact: true })).toHaveValue('hello');
  await expect(page.getByLabel('Seed')).toHaveValue('42');
  // and anything can be changed afterwards
  await page.getByLabel('Animation').selectOption({ label: '2D spin' });
  await drawn(page);
  expect(page.url()).toContain('animation=spin');
});

test('the settings live in the address, so a link brings the same GIF back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Liquid neon' }).click();
  await page.getByLabel('Seed').fill('4242');
  await page.getByLabel('Palette size').fill('6');
  await drawn(page);
  const url = page.url();
  const first = await page.locator('#status').textContent();

  await page.goto('about:blank');
  await page.goto(url);
  await drawn(page);
  await expect(page.getByLabel('Style')).toHaveValue('shadow');
  await expect(page.getByRole('checkbox', { name: 'Liquid wave' })).toBeChecked();
  await expect(page.getByLabel('Seed')).toHaveValue('4242');
  const strip = (s) => s.replace(/ · drawn in \d+ ms/, '');
  expect(strip(await page.locator('#status').textContent())).toBe(strip(first));
});

test('reroll picks a new seed', async ({ page }) => {
  await page.goto('/');
  await drawn(page);
  await page.getByRole('button', { name: 'Reroll' }).click();
  await drawn(page);
  await expect(page.getByLabel('Seed')).not.toHaveValue('1');
});

test('a tile turns off what it cannot use, and shows itself repeating', async ({ page }) => {
  await page.goto('/');
  await drawn(page);
  await page.getByRole('radio', { name: 'Seamless tile' }).check();
  await drawn(page);
  await expect(page.getByLabel('Style')).toBeDisabled();
  await expect(page.getByLabel('Word', { exact: true })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Melt' })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Decay' })).toBeEnabled();
  await expect(page.locator('#stage')).toHaveCSS('background-image', /blob:/);
  await expect(page.getByRole('link', { name: 'Download GIF' })).toHaveAttribute(
    'download',
    'tile-1.gif'
  );
});

test('the tile can sit behind a wordmark', async ({ page }) => {
  await page.goto('/');
  await drawn(page);
  const stage = page.locator('#stage');
  await expect(stage).toHaveCSS('background-image', 'none');
  const wall = page.getByRole('button', { name: 'Tile behind it' });
  await wall.click();
  await expect(wall).toHaveAttribute('aria-pressed', 'true');
  await drawn(page);
  await expect(stage).toHaveCSS('background-image', /blob:/);
});

test('a heavy GIF does not freeze the page while it draws', async ({ page }) => {
  await page.goto('/');
  await drawn(page);
  for (const box of await page.locator('#effects input').all()) await box.check();
  await page.getByLabel('Width').fill('400');
  await page.getByLabel('Height').fill('240');
  await page.getByLabel('Frames').fill('60');
  await page.waitForTimeout(200);
  // the main thread answers while the worker draws
  const started = Date.now();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  expect(Date.now() - started).toBeLessThan(500);
  await drawn(page);
});

test('the page fits a phone without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await drawn(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('an unknown path gets the 404 page', async ({ page }) => {
  const response = await page.goto('/nowhere');
  expect(response.status()).toBe(404);
  await expect(page.getByRole('link', { name: 'the front page' })).toBeVisible();
});
