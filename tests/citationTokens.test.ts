import { describe, expect, it, beforeEach } from 'vitest';
import { SearchCache } from '../src/lib/searchCache.js';
import { substituteCitationTokens } from '../src/services/agentRunner.js';

describe('Citation token substitution', () => {
  let cache: SearchCache;

  beforeEach(() => {
    cache = new SearchCache();
  });

  it('stores and retrieves citation links from cache', () => {
    const items = [
      {
        title: 'Washington Post',
        permalink: 'https://example.com/record1',
        recordId: '991027547573906121',
        catalogLink: '[Catalog link 1](https://example.com/record1)'
      },
      {
        title: 'New York Times',
        permalink: 'https://example.com/record2',
        recordId: '991027547573906122',
        catalogLink: '[Catalog link 2](https://example.com/record2)'
      }
    ];

    cache.addSearch(items);

    expect(cache.getCitationLink(0)).toBe(
      '[Catalog link 1](https://example.com/record1)'
    );
    expect(cache.getCitationLink(1)).toBe(
      '[Catalog link 2](https://example.com/record2)'
    );
    expect(cache.getCitationLink(2)).toBeNull();
  });

  it('returns null when cache is empty', () => {
    expect(cache.getCitationLink(0)).toBeNull();
  });

  it('returns null for out-of-bounds index', () => {
    const items = [
      {
        title: 'Test Item',
        permalink: 'https://example.com/record1',
        recordId: '123',
        catalogLink: '[Catalog link 1](https://example.com/record1)'
      }
    ];

    cache.addSearch(items);

    expect(cache.getCitationLink(-1)).toBeNull();
    expect(cache.getCitationLink(999)).toBeNull();
  });

  it('retrieves from most recent search', () => {
    const firstSearch = [
      {
        title: 'First Search Item',
        permalink: 'https://example.com/first',
        recordId: '111',
        catalogLink: '[Catalog link 1](https://example.com/first)'
      }
    ];

    const secondSearch = [
      {
        title: 'Second Search Item',
        permalink: 'https://example.com/second',
        recordId: '222',
        catalogLink: '[Catalog link 1](https://example.com/second)'
      }
    ];

    cache.addSearch(firstSearch);
    cache.addSearch(secondSearch);

    // Should get from most recent (second) search
    expect(cache.getCitationLink(0)).toBe(
      '[Catalog link 1](https://example.com/second)'
    );
  });

  it('substitutes citation tokens in text', () => {
    const items = [
      {
        title: 'Washington Post',
        permalink: 'https://cuny-gc.primo.exlibrisgroup.com/permalink/01CUNY_GC/1p62md4/alma991027547573906121',
        recordId: '991027547573906121',
        catalogLink: '[Catalog link 1](https://cuny-gc.primo.exlibrisgroup.com/permalink/01CUNY_GC/1p62md4/alma991027547573906121)'
      },
      {
        title: 'New York Times',
        permalink: 'https://example.com/record2',
        recordId: '991027547573906122',
        catalogLink: '[Catalog link 2](https://example.com/record2)'
      }
    ];

    cache.addSearch(items);

    const input = 'The Washington Post {{CITE_0}} and New York Times {{CITE_1}} are both available.';
    const expected = 'The Washington Post [Catalog link 1](https://cuny-gc.primo.exlibrisgroup.com/permalink/01CUNY_GC/1p62md4/alma991027547573906121) and New York Times [Catalog link 2](https://example.com/record2) are both available.';

    expect(substituteCitationTokens(input, cache)).toBe(expected);
  });

  it('preserves tokens that are not in cache', () => {
    const items = [
      {
        title: 'Test Item',
        permalink: 'https://example.com/record1',
        recordId: '123',
        catalogLink: '[Catalog link 1](https://example.com/record1)'
      }
    ];

    cache.addSearch(items);

    const input = 'Available: {{CITE_0}}, not available: {{CITE_5}}';
    const expected = 'Available: [Catalog link 1](https://example.com/record1), not available: {{CITE_5}}';

    expect(substituteCitationTokens(input, cache)).toBe(expected);
  });

  it('handles text with no tokens', () => {
    const input = 'This text has no citation tokens.';
    expect(substituteCitationTokens(input, cache)).toBe(input);
  });

  it('handles empty text', () => {
    expect(substituteCitationTokens('', cache)).toBe('');
  });
});
