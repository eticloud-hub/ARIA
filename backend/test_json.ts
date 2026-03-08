import { createContainer } from './src/container';
import { shutdownPool } from './src/db/pool';

async function testJson() {
    const container = createContainer();
    try {
        const orgId = 'a0000000-0000-0000-0000-000000000001';
        const result = await container.casesService.list(orgId, { limit: 50 });

        console.log('Result retrieved. Stringifying...');
        const str = JSON.stringify(result);
        console.log('Stringify Success! Size:', str.length);

    } catch (e) {
        console.error('JSON Stringify Error:', e.message);
    } finally {
        await shutdownPool();
    }
}

testJson().catch(console.error);
