const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const validator = require('validator');

const app = express();
const PORT = process.env.PORT || 10000;

const USERS_FILE = path.join(__dirname, 'users.json');
const ACTIVATION_CODES_FILE = path.join(__dirname, 'activationCodes.json');

// Ensure files exist before the server runs
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}
if (!fs.existsSync(ACTIVATION_CODES_FILE)) {
  fs.writeFileSync(ACTIVATION_CODES_FILE, JSON.stringify([]));
}

// Helper functions (async for scalability)
const loadUsers = () =>
  JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
const saveUsers = (users) =>
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
const loadActivationCodes = () =>
  JSON.parse(fs.readFileSync(ACTIVATION_CODES_FILE, 'utf8'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'superSecretKey',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    // secure: true, // Uncomment if using HTTPS
  }
}));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/dashboard', (req, res) => {
  if (!req.session.userEmail)
    return res.status(401).json({ message: 'Not logged in' });
  const users = loadUsers();
  const user = users.find(u => u.email === req.session.userEmail);
  if (!user)
    return res.status(404).json({ message: 'User not found' });

  const referralsCount = users.filter(u => u.referredBy === user.myReferralCode).length;
  // Remove password before returning user info
  const { password, ...safeUser } = user;
  res.json({ user: { ...safeUser, referralsCount } });
});

app.post('/signup', async (req, res) => {
  try {
    const { name, email, password, referralCode, activationCode } = req.body;
    // Basic validation
    if (!name || !email || !password || !activationCode)
      return res.status(400).json({ message: 'Name, email, password, and activation code are required.' });
    if (!validator.isEmail(email))
      return res.status(400).json({ message: 'Invalid email format.' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });

    const users = loadUsers();
    if (users.find(u => u.email === email))
      return res.status(400).json({ message: 'User already exists' });

    // Activation code validation
    const codes = loadActivationCodes();
    if (!codes.includes(activationCode))
      return res.status(400).json({ message: 'Invalid activation code.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const myReferralCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Referral logic
    let referredBy = '';
    if (referralCode) {
      const refUser = users.find(u => u.myReferralCode === referralCode);
      if (refUser) {
        referredBy = referralCode;
        refUser.wallet = (refUser.wallet || 0) + 1000;
        saveUsers(users);
      }
    }

    const newUser = { name, email, password: hashedPassword, myReferralCode, referredBy, wallet: 0 };
    users.push(newUser);
    saveUsers(users);

    req.session.userEmail = email;
    res.json({ message: 'Signup successful' });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password required.' });

    const users = loadUsers();
    const user = users.find(u => u.email === email);
    if (!user)
      return res.status(400).json({ message: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(400).json({ message: 'Invalid email or password' });

    req.session.userEmail = email;
    res.json({ message: 'Login successful' });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

// Error handler (last middleware)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
