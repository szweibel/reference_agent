import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { loadPrimoEnv } from './utils/primoEnv.js';
process.env.NODE_ENV = 'test';
let createApp;
beforeAll(async () => {
    loadPrimoEnv();
    ({ createApp } = await import('../src/server.js'));
});
describe('POST /api/primo/search', () => {
    it('returns sanitized results for a known query', async () => {
        const app = createApp();
        const response = await request(app)
            .post('/api/primo/search')
            .set('Content-Type', 'application/json')
            .send({ query: 'any,contains,"PS3523.O89 H5 1973"', limit: 2 })
            .expect(200);
        expect(Array.isArray(response.body.items)).toBe(true);
        expect(response.body.items.length).toBeGreaterThan(0);
        const first = response.body.items[0];
        expect(typeof first.title === 'string' && first.title.length > 0).toBe(true);
        expect(first.availability.local).toMatchObject({
            mainLocation: expect.stringMatching(/Mina Rees/i)
        });
        expect(first.permalink).toMatch(/^https:\/\//);
    });
    it('validates query payload', async () => {
        const app = createApp();
        const response = await request(app)
            .post('/api/primo/search')
            .set('Content-Type', 'application/json')
            .send({ query: '   ' })
            .expect(400);
        expect(response.body).toMatchObject({ error: expect.any(String) });
    });
});
//# sourceMappingURL=primoApi.test.js.map