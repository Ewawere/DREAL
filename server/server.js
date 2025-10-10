const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files (public frontend)
app.use(express.static(path.join(__dirname, "../public")));

// Sessions
app.use(
  session({
    secret: "superSecretKey",
    resave: false,
    saveUninitialized: true,
  })
);

// File for saving user data
const usersFile = path.join(__dirname, "users.json");

// Helper: Load users
function loadUsers() {
  if (!fs.existsSync(usersFile)) return [];
  const data = fs.readFileSync(usersFile);
  return JSON.parse(data);
}

// Helper: Save users
function saveUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

// ---- ROUTES ----

// Home
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Signup
app.post("/signup", async (req, res) => {
  const { name, email, password, referralCode } = req.body;
  let users = loadUsers();

  const existing = users.find((u) => u.email === email);
  if (existing) return res.status(400).json({ message: "User already exists" });

  const hashed = await bcrypt.hash(password, 10);
  const newUser = {
    name,
    email,
    password: hashed,
    referralCode: Math.random().toString(36).substring(2, 8),
    referredBy: referralCode || null,
    wallet: 0,
    referredUsers: [],
  };

  // Reward referrer once
  if (referralCode) {
    const referrer = users.find((u) => u.referralCode === referralCode);
    if (referrer && !referrer.referredUsers.includes(email)) {
      referrer.wallet += 100; // ₦100 bonus
      referrer.referredUsers.push(email);
    }
  }

  users.push(newUser);
  saveUsers(users);

  res.json({ message: "Signup successful", referralCode: newUser.referralCode });
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const users = loadUsers();
  const user = users.find((u) => u.email === email);
  if (!user) return res.status(400).json({ message: "User not found" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ message: "Invalid credentials" });

  req.session.user = user.email;
  res.json({ message: "Login successful" });
});

// Dashboard data
app.get("/dashboard-data", (req, res) => {
  if (!req.session.user) return res.status(401).json({ message: "Not logged in" });

  const users = loadUsers();
  const user = users.find((u) => u.email === req.session.user);
  if (!user) return res.status(404).json({ message: "User not found" });

  res.json({
    name: user.name,
    wallet: user.wallet,
    referralCode: user.referralCode,
    referredUsers: user.referredUsers.length,
  });
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login.html"));
});

// Handle 404 for unknown pages
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "../public/index.html"));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
