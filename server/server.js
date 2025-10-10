
const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ Correct file paths (inside the same "server" folder)
const USERS_FILE = path.join(__dirname, 'users.json');
const ACTIVATION_CODES_FILE = path.join(__dirname, 'activationCodes.json');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

app.use(session({
  secret: 'superSecretKey',
  resave: false,
  saveUninitialized: false
}));

// ✅ Ensure files exist before the server runs
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}
if (!fs.existsSync(ACTIVATION_CODES_FILE)) {
  fs.writeFileSync(ACTIVATION_CODES_FILE, JSON.stringify([]));
}

// ✅ Helper functions
function loadUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE));
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/dashboard', (req, res) => {
  if (!req.session.userEmail) return res.status(401).json({ message: 'Not logged in' });
  const users = loadUsers();
  const user = users.find(u => u.email === req.session.userEmail);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const referralsCount = users.filter(u => u.referredBy === user.myReferralCode).length;
  res.json({ user: { ...user, referralsCount } });
});

app.post('/signup', async (req, res) => {
  const { name, email, password, referralCode, activationCode } = req.body;
  const users = loadUsers();

  if (users.find(u => u.email === email)) {
    return res.status(400).json({ message: 'User already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const myReferralCode = Math.random().toString(36).substring(2, 8).toUpperCase();

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
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const users = loadUsers();

  const user = users.find(u => u.email === email);
  if (!user) return res.status(400).json({ message: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ message: 'Invalid email or password' });

  req.session.userEmail = email;
  res.json({ message: 'Login successful' });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

// Start server
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
