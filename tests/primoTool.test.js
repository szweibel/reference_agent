import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/primo/client.js', () => ({
    searchPrimo: vi.fn()
}));
const { primoSearchTool, PRIMO_TOOL_NAME } = await import('../src/tools/primoTool.js');
const { searchPrimo } = await import('../src/primo/client.js');
const searchPrimoMock = vi.mocked(searchPrimo);
beforeEach(() => {
    searchPrimoMock.mockReset();
});
describe('primoSearchTool', () => {
    it('returns catalog metadata for successful searches', async () => {
        const resultPayload = {
            info: {
                total: 2,
                totalLocal: 1,
                totalConsortium: 4,
                firstResult: 1,
                lastResult: 2,
                limit: 2,
                offset: 0
            },
            items: [
                {
                    title: 'Example Title',
                    authors: ['Author One', 'Author Two'],
                    publicationYear: '2023',
                    description: 'An illustrative catalog record.',
                    recordId: 'record-123',
                    sourceRecordId: 'source-456',
                    permalink: 'https://example.test/primo/record-123',
                    subjects: ['History', 'Libraries', 'Catalogs', 'Research', 'New York', 'Graduate Center', 'Seventh'],
                    identifiers: ['isbn:1234567890', 'oclc:987654321'],
                    publisher: 'Sample Publisher',
                    language: 'English',
                    format: 'Book',
                    availability: {
                        raw: ['Available'],
                        displayedAvailability: 'Available at Mina Rees Library',
                        isElectronic: false,
                        local: {
                            isAvailable: true,
                            status: 'Available',
                            mainLocation: 'Mina Rees Library Stacks',
                            subLocation: 'Level 2',
                            callNumber: 'QA76.76 .P75 2023',
                            libraryCode: 'GCMAIN'
                        },
                        consortium: [
                            {
                                institutionCode: 'INST1',
                                institutionName: 'Partner One',
                                status: 'Available'
                            },
                            {
                                institutionCode: 'INST2',
                                institutionName: 'Partner Two',
                                status: 'Checked out'
                            }
                        ]
                    }
                }
            ],
            raw: {}
        };
        searchPrimoMock.mockResolvedValueOnce(resultPayload);
        const response = await primoSearchTool.handler({ query: 'example title', limit: 2 }, undefined);
        expect(searchPrimoMock).toHaveBeenCalledWith(expect.objectContaining({ query: 'any,contains,"example title"', limit: 2 }));
        expect(response.isError).toBeUndefined();
        expect(response.content?.[0]).toBeDefined();
        const firstBlock = response.content?.[0];
        if (!firstBlock || firstBlock.type !== 'text' || typeof firstBlock.text !== 'string') {
            throw new Error('Expected textual tool response');
        }
        const parsed = JSON.parse(firstBlock.text);
        expect(parsed.info).toMatchObject({ total: 2, limit: 2, totalLocal: 1 });
        expect(Array.isArray(parsed.items)).toBe(true);
        expect(parsed.items).toHaveLength(1);
        const [firstItem] = parsed.items;
        expect(firstItem.title).toBe('Example Title');
        expect(firstItem.authors).toEqual(['Author One', 'Author Two']);
        expect(firstItem.subjects).toEqual(['History', 'Libraries', 'Catalogs', 'Research', 'New York', 'Graduate Center']);
        expect(firstItem.availability.local).toMatchObject({
            callNumber: 'QA76.76 .P75 2023',
            mainLocation: 'Mina Rees Library Stacks'
        });
        expect(firstItem.availability.consortium).toHaveLength(2);
    });
    it('returns error payloads when Primo calls fail', async () => {
        searchPrimoMock.mockRejectedValueOnce(new Error('Missing PRIMO_API_KEY'));
        const response = await primoSearchTool.handler({ query: 'broken' }, undefined);
        expect(response.isError).toBe(true);
        const block = response.content?.[0];
        if (!block || block.type !== 'text' || typeof block.text !== 'string') {
            throw new Error('Expected textual error payload');
        }
        const parsed = JSON.parse(block.text);
        expect(parsed).toMatchObject({ error: 'search_primo_failed' });
        expect(parsed.message).toContain('Missing PRIMO_API_KEY');
    });
});
describe('PRIMO_TOOL_NAME', () => {
    it('exposes a stable identifier for allowedTools', () => {
        expect(PRIMO_TOOL_NAME).toBe('SearchPrimo');
    });
});
//# sourceMappingURL=primoTool.test.js.map