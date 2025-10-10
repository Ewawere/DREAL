// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: "superSecretKey",
    resave: false,
    saveUninitialized: true,
  })
);

// File paths
const usersFile = path.join(__dirname, "data", "users.json");
const codesFile = path.join(__dirname, "data", "activationCodes.json");

// Ensure data files exist
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, "[]");
if (!fs.existsSync(codesFile))
  fs.writeFileSync(codesFile, JSON.stringify([
    { code: "REF100", used: false },
    { code: "REF200", used: false },
    { code: "REF300", used: false },
  ], null, 2));

// Utility functions
const loadUsers = () => JSON.parse(fs.readFileSync(usersFile, "utf8"));
const saveUsers = (users) => fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
const loadCodes = () => JSON.parse(fs.readFileSync(codesFile, "utf8"));
const saveCodes = (codes) => fs.writeFileSync(codesFile, JSON.stringify(codes, null, 2));

// Serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Signup route
app.post("/signup", async (req, res) => {
  const { name, email, password, activationCode, referralCode } = req.body;
  let users = loadUsers();
  let codes = loadCodes();

  if (users.some((u) => u.email === email)) {
    return res.status(400).json({ message: "Email already exists" });
  }

  const codeObj = codes.find((c) => c.code === activationCode);
  if (!codeObj || codeObj.used) {
    return res.status(400).json({ message: "Invalid or used activation code" });
  }

  codeObj.used = true;
  saveCodes(codes);

  const hashedPassword = await bcrypt.hash(password, 10);

  let walletBalance = 0;
  let referredBy = null;

  if (referralCode) {
    const referrer = users.find((u) => u.referralCode === referralCode);
    if (referrer) {
      referrer.walletBalance += 100;
      referredBy = referrer.email;
      saveUsers(users);
    }
  }

  const newUser = {
    name,
    email,
    password: hashedPassword,
    referralCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
    referredBy,
    walletBalance,
    referrals: [],
  };

  users.push(newUser);
  saveUsers(users);

  res.json({ message: "Signup successful!" });
});

// Login route
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const users = loadUsers();
  const user = users.find((u) => u.email === email);

  if (!user) {
    return res.status(400).json({ message: "User not found" });
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return res.status(400).json({ message: "Invalid password" });
  }

  req.session.user = { email: user.email };
  res.json({ message: "Login successful", redirect: "/dashboard.html" });
});

// Dashboard data route
app.get("/dashboard-data", (req, res) => {
  if (!req.session.user) return res.status(401).json({ message: "Unauthorized" });

  const users = loadUsers();
  const user = users.find((u) => u.email === req.session.user.email);

  if (!user) return res.status(404).json({ message: "User not found" });

  const referredUsers = users.filter((u) => u.referredBy === user.email);

  res.json({
    name: user.name,
    email: user.email,
    referralCode: user.referralCode,
    walletBalance: user.walletBalance,
    referrals: referredUsers.map((r) => r.name),
  });
});

// Logout route
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login.html");
  });
});

// Catch-all for 404 pages
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

// Start server
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
