
const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

app.use(session({
  secret: 'superSecretKey', // change this in production
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 } // 1 hour
}));

// File paths
const USERS_FILE = path.join(__dirname, 'users.json');
const CODES_FILE = path.join(__dirname, 'activation_codes.json');

// Helper functions
function readJson(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, '[]');
  return JSON.parse(fs.readFileSync(file));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ================================
// ✅ SIGNUP
// ================================
app.post('/signup', async (req, res) => {
  const { name, email, password, referralCode, activationCode } = req.body;

  if (!name || !email || !password || !activationCode) {
    return res.status(400).json({ message: 'All fields except referral are required.' });
  }

  const users = readJson(USERS_FILE);
  const codes = readJson(CODES_FILE);

  if (users.find(u => u.email === email)) {
    return res.status(400).json({ message: 'Email already registered.' });
  }

  const codeEntry = codes.find(c => c.code === activationCode && !c.used);
  if (!codeEntry) {
    return res.status(400).json({ message: 'Invalid or already used activation code.' });
  }

  // Mark activation code as used
  codeEntry.used = true;
  writeJson(CODES_FILE, codes);

  // Handle referral bonus
  if (referralCode) {
    const refUser = users.find(u => u.myReferralCode === referralCode);
    if (refUser) {
      refUser.wallet += 2000;
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    name,
    email,
    password: hashedPassword,
    wallet: 0,
    myReferralCode: 'RFER' + Math.floor(100000 + Math.random() * 900000),
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeJson(USERS_FILE, users);

  res.json({ message: 'Signup successful! You can now log in.' });
});

// ================================
// ✅ LOGIN
// ================================
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const users = readJson(USERS_FILE);
  const user = users.find(u => u.email === email);

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ message: 'Incorrect password' });
  }

  // ✅ Save session
  req.session.user = {
    name: user.name,
    wallet: user.wallet,
    myReferralCode: user.myReferralCode,
    email: user.email
  };

  res.json({
    message: `Welcome back, ${user.name}!`,
    user: req.session.user
  });
});

// ================================
// ✅ DASHBOARD (Protected Route)
// ================================
app.get('/dashboard', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Unauthorized: Please log in' });
  }

  res.json({
    message: 'Dashboard loaded',
    user: req.session.user
  });
});

// ================================
// ✅ LOGOUT
// ================================
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ message: 'Logout error' });
    res.json({ message: 'Logged out successfully' });
  });
});

// ================================
// ✅ START SERVER
// ================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
