import { beforeAll, describe, expect, it } from 'vitest';

import { searchPrimo, getPrimoConfig } from '../src/primo/client.js';
import { loadPrimoEnv } from './utils/primoEnv.js';

beforeAll(() => {
  loadPrimoEnv();
  // Ensure we resolve the config once to validate required keys early.
  getPrimoConfig();
});

describe('Primo live integration', () => {
  it('returns results for a general discovery query', async () => {
    const result = await searchPrimo({ query: 'any,contains,robotics', limit: 3 });

    expect(result.items.length).toBeGreaterThan(0);
    const first = result.items[0];
    expect(first.title).toBeTruthy();
    expect(first.availability.raw.length).toBeGreaterThan(0);
  });

  it('identifies Mina Rees print holdings when present', async () => {
    const result = await searchPrimo({ query: 'any,contains,"PS3523.O89 H5 1973"', limit: 3 });
    const localHoldings = result.items.filter((item) => item.availability.local !== null);

    expect(localHoldings.length).toBeGreaterThan(0);
    const holding = localHoldings[0];
    expect(holding.availability.local?.isAvailable).toBe(true);
    expect(holding.availability.local?.mainLocation).toMatch(/Mina Rees/i);
    expect(holding.availability.local?.callNumber).toContain('PS3523.O89 H5 1973');
    expect(holding.permalink).toMatch(/^https:\/\//);
  });
});
