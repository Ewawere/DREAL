// server.js
const express = require('express');
const bcrypt = require('bcrypt');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const validator = require('validator');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// Postgres connection - set DATABASE_URL in Render environment variables.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // If your DB requires SSL (common on cloud providers), set DB_SSL=true in Render env vars.
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

// Ensure tables exist (run at startup)
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      my_referral_code TEXT,
      referred_by TEXT,
      wallet INTEGER DEFAULT 0
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activation_codes (
      code TEXT PRIMARY KEY,
      used BOOLEAN DEFAULT FALSE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      PRIMARY KEY ("sid")
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");`);
}

app.set('trust proxy', 1); // needed on Render so secure cookies work behind the proxy

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new PgSession({
    pool,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET || 'replace-this-with-a-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

// DB helper functions
async function findUserByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0];
}

async function createUser({ name, email, passwordHash, myReferralCode, referredBy }) {
  await pool.query(
    `INSERT INTO users (name, email, password, my_referral_code, referred_by, wallet)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [name, email, passwordHash, myReferralCode, referredBy || '', 0]
  );
}

async function findActivationCode(code) {
  const { rows } = await pool.query('SELECT * FROM activation_codes WHERE code = $1', [code]);
  return rows[0];
}

async function markActivationCodeUsed(code) {
  await pool.query('UPDATE activation_codes SET used = true WHERE code = $1', [code]);
}

async function incrementReferrerWallet(referralCode, amount = 1000) {
  await pool.query(
    'UPDATE users SET wallet = wallet + $1 WHERE my_referral_code = $2',
    [amount, referralCode]
  );
}

async function getUserWithReferrals(email) {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const { rows } = await pool.query('SELECT COUNT(*)::int AS cnt FROM users WHERE referred_by = $1', [user.my_referral_code]);
  const referralsCount = rows[0] ? rows[0].cnt : 0;
  const { password, ...safeUser } = user;
  return { ...safeUser, referralsCount };
}

// Routes
app.get('/dashboard', async (req, res) => {
  if (!req.session.userEmail) return res.status(401).json({ message: 'Not logged in' });
  const userInfo = await getUserWithReferrals(req.session.userEmail);
  if (!userInfo) return res.status(404).json({ message: 'User not found' });
  res.json({ user: userInfo });
});

app.post('/signup', async (req, res) => {
  try {
    const { name, email, password, referralCode, activationCode } = req.body;
    if (!name || !email || !password || !activationCode)
      return res.status(400).json({ message: 'Name, email, password, and activation code are required.' });
    if (!validator.isEmail(email))
      return res.status(400).json({ message: 'Invalid email format.' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });

    const existing = await findUserByEmail(email);
    if (existing) return res.status(400).json({ message: 'User already exists' });

    const codeObj = await findActivationCode(activationCode);
    if (!codeObj || codeObj.used) return res.status(400).json({ message: 'Invalid or already used activation code.' });

    await markActivationCodeUsed(activationCode);

    const hashedPassword = await bcrypt.hash(password, 10);
    const myReferralCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    if (referralCode) {
      await incrementReferrerWallet(referralCode, 1000);
    }

    await createUser({
      name,
      email,
      passwordHash: hashedPassword,
      myReferralCode,
      referredBy: referralCode || ''
    });

    req.session.userEmail = email;
    res.json({ message: 'Signup successful' });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required.' });

    const user = await findUserByEmail(email);
    if (!user) return res.status(400).json({ message: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: 'Invalid email or password' });

    req.session.userEmail = email;
    res.json({ message: 'Login successful' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Start server after ensuring tables
ensureTables()
  .then(() => {
    app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('Failed to ensure DB tables:', err);
    process.exit(1);
  });
