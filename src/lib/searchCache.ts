// Simple in-memory cache for search results within a conversation session
// Stores recent Primo searches for citation token substitution

import { AsyncLocalStorage } from 'node:async_hooks';

export interface CachedSearchItem {
  title: string;
  permalink: string;
  recordId: string;
  catalogLink: string;
}

interface CachedSearchResult {
  timestamp: number;
  items: CachedSearchItem[];
}

export class SearchCache {
  private cache: CachedSearchResult[] = [];

  addSearch(items: CachedSearchItem[]): void {
    this.cache.unshift({
      timestamp: Date.now(),
      items
    });
  }

  getSearch(searchIndex: number): CachedSearchResult | null {
    if (searchIndex < 0 || searchIndex >= this.cache.length) {
      return null;
    }
    return this.cache[searchIndex] ?? null;
  }

  clear(): void {
    this.cache = [];
  }

  getSize(): number {
    return this.cache.length;
  }

  getCitationLink(itemIndex: number): string | null {
    // Get item from most recent search
    if (this.cache.length === 0) {
      return null;
    }
    const mostRecentSearch = this.cache[0];
    if (!mostRecentSearch || itemIndex < 0 || itemIndex >= mostRecentSearch.items.length) {
      return null;
    }
    const item = mostRecentSearch.items[itemIndex];
    return item?.catalogLink ?? null;
  }
}

const searchCacheStore = new AsyncLocalStorage<SearchCache>();
const fallbackCache = new SearchCache();

export function getActiveSearchCache(): SearchCache {
  return searchCacheStore.getStore() ?? fallbackCache;
}

export function runWithSearchCache<T>(fn: () => T | Promise<T>, cache: SearchCache = new SearchCache()): T | Promise<T> {
  const existing = searchCacheStore.getStore();
  if (existing === cache) {
    return fn();
  }
  if (existing) {
    // Already inside a cache context; reuse it to avoid clobbering parent scope.
    return fn();
  }
  return searchCacheStore.run(cache, fn);
}
