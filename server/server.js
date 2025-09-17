
const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Paths to JSON files
const USERS_FILE = path.join(__dirname, 'users.json');
const CODES_FILE = path.join(__dirname, 'activation_codes.json');

// Read JSON file (safely)
function readJson(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, '[]');
  return JSON.parse(fs.readFileSync(file));
}

// Write JSON file
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ===================================
// ✅ SIGNUP ROUTE
// ===================================
app.post('/signup', async (req, res) => {
  const { name, email, password, referralCode, activationCode } = req.body;

  if (!name || !email || !password || !activationCode) {
    return res.status(400).json({ message: 'All fields except referral are required.' });
  }

  const users = readJson(USERS_FILE);
  const codes = readJson(CODES_FILE);

  // Check if user already exists
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ message: 'Email already registered.' });
  }

  // Validate activation code
  const codeEntry = codes.find(c => c.code === activationCode && !c.used);
  if (!codeEntry) {
    return res.status(400).json({ message: 'Invalid or already used activation code.' });
  }

  // Mark code as used
  codeEntry.used = true;
  writeJson(CODES_FILE, codes);

  // Handle referral
  if (referralCode) {
    const refUser = users.find(u => u.myReferralCode === referralCode);
    if (refUser) {
      refUser.wallet += 2000;
    }
  }

  // Create new user
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

// ===================================
// ✅ LOGIN ROUTE
// ===================================
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

  // Send safe user info for dashboard
  res.json({
    message: `Welcome back, ${user.name}!`,
    user: {
      name: user.name,
      wallet: user.wallet,
      myReferralCode: user.myReferralCode
    }
  });
});

// ===================================
// ✅ START SERVER
// ===================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
