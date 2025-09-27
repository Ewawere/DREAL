
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

// Temporary in-memory "database"
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

// Signup
app.post('/signup', (req, res) => {
  const { name, email, password, activationCode, referralCode } = req.body;

  if (!name || !email || !password || !activationCode) {
    return res.status(400).json({ message: 'Please fill in all required fields.' });
  }

  // Validate activation code
  const validActivationCode = 'ACT123';
  if (activationCode !== validActivationCode) {
    return res.status(400).json({ message: 'Invalid activation code.' });
  }

  if (users.find(u => u.email === email)) {
    return res.status(400).json({ message: 'Email already exists.' });
  }

  // Generate referral code for the new user
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

  // **Referral reward**: Only give reward if the user hasn't been referred before
  if (referralCode) {
    const referrer = users.find(u => u.myReferralCode === referralCode);
    if (referrer) {
      // Check if this new user already counted for this referral
      const alreadyCounted = users.some(u => u.email === email && u.referredBy === referralCode);
      if (!alreadyCounted) {
        referrer.wallet += 2000; // reward ₦2000 per unique referral
      }
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
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid email or password' });
  }
});

// Dashboard
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });

  const user = req.session.user;

  // Count how many users were referred by this user
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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
