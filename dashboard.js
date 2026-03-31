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

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // serve public folder

app.use(
  session({
    secret: 'furysecret',
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

// ===== MONGODB =====
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Dashboard MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ===== SCHEMA =====
const userSchema = new mongoose.Schema({
  userId: String,
  total: Number,
  active: Boolean,
  lastClick: Number,
});

const User = mongoose.model('User', userSchema);

// ===== DISCORD OAUTH =====
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(
  new DiscordStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: process.env.CALLBACK_URL,
      scope: ['identify'],
    },
    (accessToken, refreshToken, profile, done) => done(null, profile)
  )
);

// ===== ROUTES =====

// Login
app.get('/auth/discord', passport.authenticate('discord'));

// Callback
app.get(
  '/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req, res) => res.redirect('/dashboard.html')
);

// Logout
app.get('/logout', (req, res) => {
  req.logout(() => {});
  res.redirect('/');
});

// ===== API: Leaderboard =====
app.get('/api/leaderboard', async (req, res) => {
  try {
    const users = await User.find().sort({ total: -1 }).limit(50);

    const result = await Promise.all(
      users.map(async u => {
        try {
          const user = await axios.get(`https://discord.com/api/v10/users/${u.userId}`, {
            headers: { Authorization: `Bot ${process.env.TOKEN}` },
          });

          return {
            username: user.data.username,
            avatar: user.data.avatar
              ? `https://cdn.discordapp.com/avatars/${u.userId}/${user.data.avatar}.png`
              : null,
            total: u.total,
            active: u.active,
          };
        } catch {
          return {
            username: u.userId,
            avatar: null,
            total: u.total,
            active: u.active,
          };
        }
      })
    );

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ===== ROOT ROUTE =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ===== SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Dashboard running on port ${PORT}`));