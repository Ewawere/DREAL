const express = require('express');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'superSecretKey',
  resave: false,
  saveUninitialized: true,
}));

// --- In-memory data ---
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

// Activation codes that can be used only once
let activationCodes = ['ACT123', 'ACT234', 'ACT345', 'ACT456', 'ACT567'];

// --- Routes ---

// Serve homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Signup route
app.post('/signup', (req, res) => {
  const { name, email, password, activationCode, referralCode } = req.body;

  if (!name || !email || !password || !activationCode) {
    return res.status(400).json({ message: 'Please fill in all required fields.' });
  }

  // Check activation code validity
  if (!activationCodes.includes(activationCode)) {
    return res.status(400).json({ message: 'Invalid or already used activation code.' });
  }

  if (users.find(u => u.email === email)) {
    return res.status(400).json({ message: 'Email already exists.' });
  }

  // Generate new referral code
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

  // Referral reward logic
  if (referralCode) {
    const referrer = users.find(u => u.myReferralCode === referralCode);
    if (referrer) {
      referrer.wallet += 2000; // ₦2000 reward
    }
  }

  // Mark activation code as used
  activationCodes = activationCodes.filter(code => code !== activationCode);

  req.session.user = newUser;
  res.json({ message: 'Signup successful! Redirecting to login...' });
});

// Login route
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

// Dashboard route
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.status(401).json({ message: 'Not logged in' });

  // Always get latest info
  const user = users.find(u => u.email === req.session.user.email);

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

// Catch-all route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
