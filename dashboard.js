require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

const app = express();

// ===== Middleware =====
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // serve static files

app.use(
  session({
    secret: 'furysecret',
    resave: false,
    saveUninitialized: false
  })
);

app.use(passport.initialize());
app.use(passport.session());

// ===== MongoDB =====
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Dashboard MongoDB connected'))
  .catch((err) => console.error(err));

// ===== Schema =====
const userSchema = new mongoose.Schema({
  userId: String,
  total: Number,
  active: Boolean,
  lastClick: Number
});
const User = mongoose.model('User', userSchema);

// ===== Discord OAuth =====
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(
  new DiscordStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: process.env.CALLBACK_URL,
      scope: ['identify']
    },
    (accessToken, refreshToken, profile, done) => {
      return done(null, profile);
    }
  )
);

// ===== Routes =====

// Serve dashboard.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Login
app.get('/auth/discord', passport.authenticate('discord'));

// Callback
app.get(
  '/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

// Logout
app.get('/logout', (req, res) => {
  req.logout(() => {});
  res.redirect('/');
});

// API: Leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const users = await User.find().sort({ total: -1 }).limit(50);

    const result = await Promise.all(
      users.map(async (u) => {
        try {
          const user = await axios.get(
            `https://discord.com/api/v10/users/${u.userId}`,
            {
              headers: { Authorization: `Bot ${process.env.TOKEN}` }
            }
          );

          return {
            username: user.data.username,
            avatar: `https://cdn.discordapp.com/avatars/${u.userId}/${user.data.avatar}.png`,
            total: u.total,
            active: u.active
          };
        } catch {
          return {
            username: u.userId,
            avatar: null,
            total: u.total,
            active: u.active
          };
        }
      })
    );

    res.json(result);
  } catch {
    res.status(500).json({ error: 'error' });
  }
});

// ===== Server =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Dashboard running on port ${PORT}`);
});