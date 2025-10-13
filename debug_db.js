// debug_db.js
// Place this file in the repository root (NOT in public/).
// Run as a Render Background Worker with DATABASE_URL and DB_SSL env vars set.
// Optional env vars:
// - TEST_CODE (default 'ABC123')
// - CREATE_TEST_CODE = 'true' to insert the test code if missing
const { Pool } = require('pg');

async function ensureSessionTable(pool) {
  const createSql = `
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL,
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
);
ALTER TABLE "session" ADD CONSTRAINT IF NOT EXISTS "session_pkey" PRIMARY KEY ("sid");
`;
  await pool.query(createSql);
  console.log('Ensured "session" table exists (or already existed).');
}

async function checkOrInsertActivationCode(pool, code, createIfMissing) {
  try {
    const res = await pool.query(
      `SELECT * FROM activation_codes WHERE LOWER(code) = LOWER($1) LIMIT 1;`,
      [code]
    );
    if (res.rows.length > 0) {
      console.log(`Activation code "${code}" exists:`, res.rows[0]);
      return;
    }
  } catch (err) {
    console.log('activation_codes table not found or query failed:', err.message);
    if (!createIfMissing) return;
    // fallthrough to try to create a row (we'll attempt to create table row; if table missing, this will error)
  }

  if (createIfMissing) {
    try {
      // Attempt to insert. If table doesn't exist this will throw an error.
      await pool.query(
        `INSERT INTO activation_codes (code, created_at) VALUES ($1, NOW());`,
        [code]
      );
      console.log(`Inserted activation code "${code}".`);
    } catch (e) {
      console.log('Could not insert activation code (maybe table missing). Error:', e.message);
    }
  } else {
    console.log(`Activation code "${code}" not found.`);
  }
}

async function run() {
  const ssl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;
  const conn = process.env.DATABASE_URL;
  if (!conn) {
    console.error('ERROR: DATABASE_URL environment variable is not set.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: conn, ssl });

  const testCode = process.env.TEST_CODE || 'ABC123';
  const createIfMissing = process.env.CREATE_TEST_CODE === 'true';

  try {
    console.log('Connecting to DB...');
    await pool.query('SELECT 1'); // quick check
    console.log('Connected.');

    // Ensure session table exists
    await ensureSessionTable(pool);

    // Show list of relevant tables (session and activation_codes)
    const tbls = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_name IN ('session','sessions','activation_codes');`
    );
    console.log('Relevant tables found:', tbls.rows.map(r => r.table_name));

    // Show activation code rows for the test code
    await checkOrInsertActivationCode(pool, testCode, createIfMissing);

    // If activation_codes exists, show its column definitions
    try {
      const cols = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'activation_codes';`
      );
      console.log('activation_codes columns:', cols.rows);
    } catch (e) {
      console.log('Could not read activation_codes columns:', e.message);
    }

  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    await pool.end();
    console.log('Done.');
  }
}

run();
