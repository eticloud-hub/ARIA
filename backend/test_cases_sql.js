const { Client } = require('pg');

async function testQuery() {
    const c = new Client('postgresql://aria_admin:aria_dev_password@localhost:5433/aria');
    await c.connect();

    try {
        const query = `
            SELECT c.* FROM cases c 
            WHERE c.organisation_id = $1 AND c.deleted_at IS NULL 
            ORDER BY c.created_at DESC 
            LIMIT $2
        `;
        const params = ['a0000000-0000-0000-0000-000000000001', 51];

        console.log('Running query:', query);
        console.log('Params:', params);

        const res = await c.query(query, params);
        console.log('Success! Rows returned:', res.rowCount);
    } catch (e) {
        console.error('DATABASE ERROR:', e.message);
    } finally {
        await c.end();
    }
}

testQuery().catch(console.error);
