
const express = require('express');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(session({
  secret: 'superSecretKey',
  resave: false,
  saveUninitialized: true,
}));

// --- In-memory "database" ---
const users = [
  { 
    name: 'Admin User',
    email: 'user@example.com', 
    password: '1234', 
    wallet: 5000, 
    myReferralCode: 'ABC123',
    referredBy: null,
    activationCode: 'ACT123'
  }
];

// --- Routes ---

// Homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Signup page (optional if not handled by frontend)
app.get('/signup.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'signup.html'));
});

// Login page
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// Dashboard page
app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

// Signup
app.post('/signup', (req, res) => {
  const { name, email, password, activationCode, referralCode } = req.body;

  if (!name || !email || !password || !activationCode) {
    return res.status(400).json({ message: 'Please fill in all required fields.' });
  }

  if (activationCode !== 'ACT123') {
    return res.status(400).json({ message: 'Invalid activation code.' });
  }

  if (users.find(u => u.email === email)) {
    return res.status(400).json({ message: 'Email already exists.' });
  }

  const newReferralCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  const newUser = {
    name,
    email,
    password,
    wallet: 0,
    myReferralCode: newReferralCode,
    referredBy: referralCode || null,
    activationCode
  };

  users.push(newUser);

  // Referral reward
  if (referralCode) {
    const referrer = users.find(u => u.myReferralCode === referralCode);
    if (referrer) {
      const alreadyCounted = users.some(u => u.email === email && u.referredBy === referralCode);
      if (!alreadyCounted) referrer.wallet += 2000;
    }
  }

  req.session.user = newUser;
  res.json({ message: 'Signup successful! Redirecting to login...' });
});

// Login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email && u.password === password);
  if (user) {
    req.session.user = user;
    res.json({ message: 'Login successful!' });
  } else {
    res.status(401).json({ message: 'Invalid email or password' });
  }
});

// Dashboard API
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.status(401).json({ message: 'Not logged in' });

  const user = req.session.user;
  const referralsCount = users.filter(u => u.referredBy === user.myReferralCode).length;

  res.json({
    user: {
      name: user.name,
      email: user.email,
      wallet: user.wallet,
      myReferralCode: user.myReferralCode,
      referredBy: user.referredBy || 'N/A',
      referralsCount
    }
  });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.sendStatus(200);
});

// Catch-all: serve index.html for unknown paths
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
