const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const USERS_FILE = path.join(__dirname, 'users.json');
const CODES_FILE = path.join(__dirname, 'activation_codes.json');

// Utility to read JSON files
function readJson(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, '[]');
  return JSON.parse(fs.readFileSync(file));
}

// Utility to write JSON files
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// POST /signup
app.post('/signup', async (req, res) => {
  const { name, email, password, referralCode, activationCode } = req.body;

  // Validate input
  if (!name || !email || !password || !activationCode) {
    return res.status(400).json({ message: 'All fields except referral are required.' });
  }

  const users = readJson(USERS_FILE);
  const codes = readJson(CODES_FILE);

  // Check if email already exists
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ message: 'Email already registered.' });
  }

  // Check if activation code is valid and unused
  const codeEntry = codes.find(c => c.code === activationCode && !c.used);
  if (!codeEntry) {
    return res.status(400).json({ message: 'Invalid or used activation code.' });
  }

  // Mark activation code as used
  codeEntry.used = true;
  writeJson(CODES_FILE, codes);

  // Referral system
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
    myReferralCode: 'RFER' + Math.floor(Math.random() * 1000000),
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeJson(USERS_FILE, users);

  res.json({ message: 'Signup successful! You can now log in.' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
