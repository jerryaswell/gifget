import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** WCAG 2.0/2.1/2.2 A and AA, which is the bar the page is held to. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const audit = (page) => new AxeBuilder({ page }).withTags(TAGS).analyze();

/** Readable failure output: rule, impact and the elements that tripped it. */
const summarise = (violations) =>
  violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 6),
  }));

const drawn = (page) => expect(page.locator('#status')).toHaveText(/ms$/, { timeout: 15_000 });

test('the page has no accessibility violations, cold', async ({ page }) => {
  await page.goto('/');
  await drawn(page);
  const { violations } = await audit(page);
  expect(summarise(violations)).toEqual([]);
});

test('no violations with the tile behind the mark', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tile behind it' }).click();
  await page.getByRole('button', { name: 'Deep 3D' }).click();
  await drawn(page);
  const { violations } = await audit(page);
  expect(summarise(violations)).toEqual([]);
});

test('no violations with a tile chosen and controls turned off', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Seamless tile' }).check();
  await drawn(page);
  const { violations } = await audit(page);
  expect(summarise(violations)).toEqual([]);
});

test('no violations while a new GIF is being drawn', async ({ page }) => {
  await page.goto('/');
  await drawn(page);
  await page.getByLabel('Word', { exact: true }).fill('voidnet');
  const { violations } = await audit(page);
  expect(summarise(violations)).toEqual([]);
});

test('no violations on the 404 page', async ({ page }) => {
  await page.goto('/nowhere');
  const { violations } = await audit(page);
  expect(summarise(violations)).toEqual([]);
});
