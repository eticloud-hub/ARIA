const { Client } = require('pg');
const bcrypt = require('bcryptjs');

async function fix() {
    const c = new Client('postgresql://aria_admin:aria_dev_password@localhost:5433/aria');
    await c.connect();

    // Generate fresh hash inside Node.js to guarantee zero shell tampering
    const plainText = 'AriaAdmin2026!';
    const hash = await bcrypt.hash(plainText, 10);
    console.log('Generated hash:', hash);

    const res = await c.query('UPDATE users SET password_hash = $1', [hash]);
    console.log('Fixed users:', res.rowCount);

    const verifyUser = await c.query("SELECT * FROM users WHERE email = 'admin@aria.dev'");
    const user = verifyUser.rows[0];
    const match = await bcrypt.compare(plainText, user.password_hash);
    console.log('Bcrypt Match (read directly from DB)?', match);

    await c.end();
}

fix().catch(console.error);
