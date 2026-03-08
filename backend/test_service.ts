import { createContainer } from './src/container';
import { runMigrations } from './src/db/migrate';
import { shutdownPool } from './src/db/pool';

async function testService() {
    const container = createContainer();
    console.log('Container created');

    try {
        const orgId = 'a0000000-0000-0000-0000-000000000001';
        const result = await container.casesService.list(orgId, { limit: 50 });
        console.log('Success!', result.cases.length, 'cases found.');
    } catch (e) {
        console.error('Service Error:', e);
    } finally {
        await shutdownPool();
    }
}

testService().catch(console.error);
