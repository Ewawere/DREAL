
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
  { email: 'user@example.com', password: '1234', wallet: 5000, myReferralCode: 'ABC123' }
];

// --- Routes ---

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

// Dashboard data
app.get('/dashboard', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  res.json({ user: req.session.user });
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
