const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

app.use(
  session({
    secret: "superSecretKey",
    resave: false,
    saveUninitialized: false,
  })
);

// Load data
const usersFile = path.join(__dirname, "users.json");
const codesFile = path.join(__dirname, "activationCodes.json");

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file));
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// =========================== ROUTES ===========================

// Serve pages
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/login.html"));
});

app.get("/dashboard", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  res.sendFile(path.join(__dirname, "../public/dashboard.html"));
});

// =========================== AUTH ===========================

// Signup
app.post("/signup", async (req, res) => {
  const { name, email, password, referralCode, activationCode } = req.body;

  let users = readJSON(usersFile);
  let codes = readJSON(codesFile);

  if (users.find((u) => u.email === email)) {
    return res.status(400).json({ error: "Email already exists" });
  }

  // Check activation code validity
  const codeIndex = codes.findIndex(
    (c) => c.code === activationCode && !c.used
  );
  if (codeIndex === -1) {
    return res.status(400).json({ error: "Invalid or already used activation code" });
  }

  // Mark activation code as used
  codes[codeIndex].used = true;
  writeJSON(codesFile, codes);

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    id: Date.now(),
    name,
    email,
    password: hashedPassword,
    referralCode: Math.random().toString(36).substr(2, 6).toUpperCase(),
    referredUsers: [],
    wallet: 0,
  };

  // Handle referral bonus
  if (referralCode) {
    const referrer = users.find((u) => u.referralCode === referralCode);
    if (referrer) {
      referrer.referredUsers.push(newUser.email);
      referrer.wallet += 500; // Adjust bonus here if needed
    }
  }

  users.push(newUser);
  writeJSON(usersFile, users);

  res.json({ success: true, message: "Signup successful!" });
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  let users = readJSON(usersFile);

  const user = users.find((u) => u.email === email);
  if (!user) return res.status(400).json({ error: "Invalid email or password" });

  const validPass = await bcrypt.compare(password, user.password);
  if (!validPass)
    return res.status(400).json({ error: "Invalid email or password" });

  req.session.userId = user.id;
  res.json({ success: true });
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// =========================== DASHBOARD DATA ===========================

app.get("/user-data", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const users = readJSON(usersFile);
  const user = users.find((u) => u.id === req.session.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    name: user.name,
    email: user.email,
    referralCode: user.referralCode,
    referredUsers: user.referredUsers,
    wallet: user.wallet,
  });
});

// =========================== SERVER ===========================

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

