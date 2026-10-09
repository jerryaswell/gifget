import { test, expect } from '@playwright/test';

const drawn = (page) => expect(page.locator('#status')).not.toHaveText(/Drawing/);

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
  await expect(page.getByRole('button', { name: 'Borked' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  const download = page.getByRole('link', { name: 'Download GIF' });
  await expect(download).toHaveAttribute('href', /^blob:/);
  await expect(download).toHaveAttribute('download', 'zomnbio_borked.gif');
  await expect(page.locator('#preview')).toHaveAttribute('alt', /zomnbio/);
  const natural = await page
    .locator('#preview')
    .evaluate((img) => img.decode().then(() => img.naturalWidth));
  expect(natural).toBe(300);
});

test('the browser decodes it as an endlessly looping animation', async ({ page }) => {
  await page.goto('/');
  await drawn(page);
  const gif = await decodePreview(page);
  expect(gif).toMatchObject({ frames: 24, width: 300, height: 130 });
  expect(gif.repetition).toBe(Infinity);
  expect(gif.duration).toBe(90_000); // microseconds
});

test('every look draws, and its defaults come with it', async ({ page }) => {
  await page.goto('/');
  const buttons = page.locator('#picks button');
  const count = await buttons.count();
  expect(count).toBeGreaterThanOrEqual(10);
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#picks [aria-pressed="true"]')).toHaveCount(1);
    await drawn(page);
    const gif = await decodePreview(page);
    expect(gif.frames).toBeGreaterThan(1);
  }
});

test('a new word renames the download', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Word').fill('VOIDNET');
  await page.getByRole('button', { name: 'Cyan chrome' }).click();
  await drawn(page);
  await expect(page.getByRole('link', { name: 'Download GIF' })).toHaveAttribute(
    'download',
    'voidnet_chrome.gif'
  );
});

test('the settings live in the address, so a link brings the same GIF back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Liquid neon' }).click();
  await page.getByLabel('Seed').fill('4242');
  await page.getByLabel('Colours').fill('6');
  await drawn(page);
  const url = page.url();
  expect(url).toContain('effect=wave');
  expect(url).toContain('seed=4242');

  const first = await page.locator('#status').textContent();
  await page.goto('about:blank');
  await page.goto(url);
  await drawn(page);
  await expect(page.getByRole('button', { name: 'Liquid neon' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByLabel('Seed')).toHaveValue('4242');
  // same size, frames and colours: the drawing time is the only thing that may differ
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

test('the tile can sit behind the mark, and shows itself repeating', async ({ page }) => {
  await page.goto('/');
  await drawn(page);
  const stage = page.locator('#stage');
  await expect(stage).toHaveCSS('background-image', 'none');

  const wall = page.getByRole('button', { name: 'Tile behind it' });
  await wall.click();
  await expect(wall).toHaveAttribute('aria-pressed', 'true');
  await drawn(page);
  await expect(stage).toHaveCSS('background-image', /blob:/);

  await wall.click();
  await page.getByRole('button', { name: 'Seamless tile' }).click();
  await drawn(page);
  await expect(stage).toHaveCSS('background-image', /blob:/);
  await expect(page.getByRole('link', { name: 'Download GIF' })).toHaveAttribute(
    'download',
    'tile_tile.gif'
  );
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
