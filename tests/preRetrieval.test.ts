import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import * as libguidesClient from '../src/libguides/client.js';

type UserPromptSubmitHookType = (typeof import('../src/services/preRetrieval.js'))['userPromptSubmitHook'];

// Mock the libguides client
vi.mock('../src/libguides/client.js', () => ({
  searchGuides: vi.fn()
}));

let userPromptSubmitHook: UserPromptSubmitHookType;

describe('preRetrieval', () => {
  beforeAll(async () => {
    // Initial import
    const module = await import('../src/services/preRetrieval.js');
    userPromptSubmitHook = module.userPromptSubmitHook;
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset the module cache and re-import to get fresh cache
    await vi.resetModules();
    const module = await import('../src/services/preRetrieval.js');
    userPromptSubmitHook = module.userPromptSubmitHook;
  });

  describe('userPromptSubmitHook', () => {
    it('should fetch complete guide catalog and inject as context', async () => {
      const mockCatalogResult = {
        guides: [
          {
            id: 123,
            name: 'Library Hours',
            url: 'https://libguides.gc.cuny.edu/hours',
            description: 'Information about library hours and schedules'
          },
          {
            id: 456,
            name: 'Evidence Synthesis',
            url: 'https://libguides.gc.cuny.edu/evidencesynthesis',
            description: 'Comprehensive guidance on systematic reviews, scoping reviews, meta-analyses, and other evidence synthesis methodologies'
          }
        ],
        total: 2
      };

      vi.mocked(libguidesClient.searchGuides).mockResolvedValue(mockCatalogResult);

      const input = {
        hook_event_name: 'UserPromptSubmit' as const,
        prompt: 'What are the library hours?',
        session_id: 'test-session',
        transcript_path: '/tmp/transcript',
        cwd: '/test'
      };

      const result = await userPromptSubmitHook(input, undefined, { signal: new AbortController().signal });

      // Verify searchGuides was called for complete catalog (empty search)
      expect(libguidesClient.searchGuides).toHaveBeenCalledWith({
        search: '',
        limit: 200,
        expand: ''
      });

      // Verify context was injected
      expect(result).toHaveProperty('hookSpecificOutput');
      expect(result.hookSpecificOutput).toHaveProperty('hookEventName', 'UserPromptSubmit');
      expect(result.hookSpecificOutput).toHaveProperty('additionalContext');

      const context = result.hookSpecificOutput?.additionalContext;
      expect(context).toContain('LibGuides Catalog');
      expect(context).toContain('Library Hours');
      expect(context).toContain('Evidence Synthesis');

      // Should contain descriptions
      expect(context).toContain('library hours and schedules');
      expect(context).toContain('systematic reviews');

      // Should NOT contain URLs (agent gets those from SearchGuides later)
      expect(context).not.toContain('https://libguides.gc.cuny.edu/hours');
      expect(context).not.toContain('https://libguides.gc.cuny.edu/evidencesynthesis');
    });

    it('should use cached catalog on second call', async () => {
      const mockCatalogResult = {
        guides: [
          {
            id: 123,
            name: 'Test Guide',
            url: 'https://libguides.gc.cuny.edu/test',
            description: 'Test description'
          }
        ],
        total: 1
      };

      vi.mocked(libguidesClient.searchGuides).mockResolvedValue(mockCatalogResult);

      const input = {
        hook_event_name: 'UserPromptSubmit' as const,
        prompt: 'First query',
        session_id: 'test-session',
        transcript_path: '/tmp/transcript',
        cwd: '/test'
      };

      // First call - should fetch from API
      await userPromptSubmitHook(input, undefined, { signal: new AbortController().signal });
      expect(libguidesClient.searchGuides).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      await userPromptSubmitHook({ ...input, prompt: 'Second query' }, undefined, { signal: new AbortController().signal });
      expect(libguidesClient.searchGuides).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should handle empty catalog gracefully', async () => {
      const mockSearchResult = {
        guides: [],
        total: 0
      };

      vi.mocked(libguidesClient.searchGuides).mockResolvedValue(mockSearchResult);

      const input = {
        hook_event_name: 'UserPromptSubmit' as const,
        prompt: 'What are the library hours?',
        session_id: 'test-session',
        transcript_path: '/tmp/transcript',
        cwd: '/test'
      };

      const result = await userPromptSubmitHook(input, undefined, { signal: new AbortController().signal });

      expect(result.hookSpecificOutput?.additionalContext).toContain('No LibGuides available');
    });

    it('should not break if catalog fetch fails', async () => {
      vi.mocked(libguidesClient.searchGuides).mockRejectedValue(new Error('Network error'));

      const input = {
        hook_event_name: 'UserPromptSubmit' as const,
        prompt: 'What are the library hours?',
        session_id: 'test-session',
        transcript_path: '/tmp/transcript',
        cwd: '/test'
      };

      const result = await userPromptSubmitHook(input, undefined, { signal: new AbortController().signal });

      // Should return without context but not throw
      expect(result).toHaveProperty('hookSpecificOutput');
      expect(result.hookSpecificOutput).toHaveProperty('hookEventName', 'UserPromptSubmit');
      expect(result.hookSpecificOutput?.additionalContext).toBeUndefined();
    });

    it('should handle wrong hook event gracefully', async () => {
      const input = {
        hook_event_name: 'SessionStart' as any,
        prompt: 'test',
        session_id: 'test-session',
        transcript_path: '/tmp/transcript',
        cwd: '/test'
      };

      const result = await userPromptSubmitHook(input, undefined, { signal: new AbortController().signal });

      // Should return without calling searchGuides
      expect(libguidesClient.searchGuides).not.toHaveBeenCalled();
      expect(result.hookSpecificOutput?.additionalContext).toBeUndefined();
    });

    it('should truncate long descriptions to 150 characters', async () => {
      const longDescription = 'A'.repeat(200); // 200 character description

      const mockCatalogResult = {
        guides: [
          {
            id: 123,
            name: 'Test Guide',
            url: 'https://libguides.gc.cuny.edu/test',
            description: longDescription
          }
        ],
        total: 1
      };

      vi.mocked(libguidesClient.searchGuides).mockResolvedValue(mockCatalogResult);

      const input = {
        hook_event_name: 'UserPromptSubmit' as const,
        prompt: 'test',
        session_id: 'test-session',
        transcript_path: '/tmp/transcript',
        cwd: '/test'
      };

      const result = await userPromptSubmitHook(input, undefined, { signal: new AbortController().signal });
      const context = result.hookSpecificOutput?.additionalContext;

      // Should contain truncated description with ellipsis
      expect(context).toContain('A'.repeat(150) + '...');
      // Should NOT contain the full 200 characters
      expect(context).not.toContain('A'.repeat(200));
    });
  });
});
