const { Client } = require('pg');
const bcrypt = require('bcryptjs');

async function test() {
    const c = new Client('postgresql://aria_admin:aria_dev_password@localhost:5433/aria');
    await c.connect();

    const res = await c.query("SELECT * FROM users WHERE email = 'admin@aria.dev'");
    const user = res.rows[0];
    console.log('User found:', !!user);
    if (user) {
        console.log('Active?', user.is_active);
        const match = await bcrypt.compare('AriaAdmin2026!', user.password_hash);
        console.log('Bcrypt Match?', match);
    }
    await c.end();
}

test().catch(console.error);
