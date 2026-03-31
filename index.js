require('dotenv').config();

const mongoose = require('mongoose');
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  EmbedBuilder,
  AttachmentBuilder
} = require('discord.js');

const fs = require('fs');
const path = require('path');

// ===== MongoDB =====
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ===== Schema =====
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  total: { type: Number, default: 0 },
  active: { type: Boolean, default: false },
  lastClick: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// ===== Bot Setup =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.TOKEN;
const ASSIST_CHANNELS = (process.env.ASSIST_CHANNELS || '').split(',').filter(Boolean);

// ===== Buttons =====
const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('in').setLabel('IN').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId('out').setLabel('OUT').setStyle(ButtonStyle.Danger)
);

// ===== Helper =====
async function getUser(userId) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = new User({ userId });
    await user.save();
  }
  return user;
}

function isAdmin(member) {
  return member.permissions.has('Administrator');
}

// ===== PANEL =====
async function sendPanel(channel) {
  const filePath = path.join(__dirname, 'assets', 'design.gif');

  if (!fs.existsSync(filePath)) {
    return channel.send("❌ GIF not found");
  }

  const attachment = new AttachmentBuilder(filePath);

  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle("Fury Management System")
    .setDescription("Click **IN** to start the timer. Must click every 30 min.")
    .setImage('attachment://design.gif')
    .setFooter({ text: "Fury RP" });

  await channel.send({
    embeds: [embed],
    files: [attachment],
    components: [row]
  });
}

// ===== Commands =====
client.on('messageCreate', async msg => {
  if (!msg.guild || msg.author.bot) return;

  if (msg.content === '!panel') return sendPanel(msg.channel);

  if (msg.content === '!leaderboard') {
    const users = await User.find().sort({ total: -1 });
    let desc = users.length ? '' : 'No data yet';

    users.forEach((u, i) => {
      desc += `**${i + 1}.** <@${u.userId}> — **${u.total} points**\n`;
    });

    return msg.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle('🏆 Fury Leaderboard')
          .setDescription(desc)
      ]
    });
  }

  if (msg.content === '!resetpoints') {
    if (!isAdmin(msg.member)) return;
    await User.updateMany({}, { total: 0 });
    return msg.reply("✅ All points reset!");
  }

  if (msg.content.startsWith('!addpoints')) {
    if (!isAdmin(msg.member)) return;

    const mention = msg.mentions.users.first();
    const points = parseInt(msg.content.split(' ')[2]);

    if (!mention || isNaN(points)) {
      return msg.reply('Usage: !addpoints @user 50');
    }

    await User.updateOne(
      { userId: mention.id },
      { $inc: { total: points } },
      { upsert: true }
    );

    return msg.reply(`✅ Added ${points} points to <@${mention.id}>`);
  }

  if (msg.content.startsWith('!removepoints')) {
    if (!isAdmin(msg.member)) return;

    const mention = msg.mentions.users.first();
    const points = parseInt(msg.content.split(' ')[2]);

    if (!mention || isNaN(points)) {
      return msg.reply('Usage: !removepoints @user 50');
    }

    await User.updateOne(
      { userId: mention.id },
      { $inc: { total: -points } }
    );

    return msg.reply(`➖ Removed ${points} points from <@${mention.id}>`);
  }

  if (msg.content.startsWith('!setpoints')) {
    if (!isAdmin(msg.member)) return;

    const mention = msg.mentions.users.first();
    const points = parseInt(msg.content.split(' ')[2]);

    if (!mention || isNaN(points)) {
      return msg.reply('Usage: !setpoints @user 50');
    }

    await User.updateOne(
      { userId: mention.id },
      { $set: { total: points } },
      { upsert: true }
    );

    return msg.reply(`🎯 Set <@${mention.id}> points to ${points}`);
  }

  if (msg.content === '!top10') {
    const users = await User.find().sort({ total: -1 }).limit(10);

    let desc = users.length ? '' : 'No data yet';

    users.forEach((u, i) => {
      desc += `**${i + 1}.** <@${u.userId}> — **${u.total} points**\n`;
    });

    return msg.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00FFAA)
          .setTitle('🔥 Top 10 Leaderboard')
          .setDescription(desc)
      ]
    });
  }
});

// ===== Buttons =====
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  let user = await getUser(userId);

  const member = interaction.guild.members.cache.get(userId);
  const inAssist = member?.voice.channelId && ASSIST_CHANNELS.includes(member.voice.channelId);

  if (!inAssist) return interaction.reply({ content: '❌ Join assist VC', ephemeral: true });

  if (interaction.customId === 'in') {
    if (user.active) return interaction.reply({ content: '⚠️ Already IN', ephemeral: true });

    user.active = true;
    user.lastClick = Date.now();
    await user.save();

    return interaction.reply({ content: '✅ Signed IN', ephemeral: true });
  }

  if (interaction.customId === 'out') {
    if (!user.active) return interaction.reply({ content: '⚠️ Not IN', ephemeral: true });

    user.active = false;
    user.lastClick = 0;
    await user.save();

    return interaction.reply({ content: '⛔ Signed OUT', ephemeral: true });
  }
});

// ===== Timer =====
setInterval(async () => {
  const now = Date.now();
  const users = await User.find({ active: true });

  for (const user of users) {
    let member = null;

    for (const g of client.guilds.cache.values()) {
      const m = g.members.cache.get(user.userId);
      if (m) { member = m; break; }
    }

    if (!member || !member.voice.channelId) continue;

    const inAssist = ASSIST_CHANNELS.includes(member.voice.channelId);

    if (!inAssist || member.voice.selfDeaf || now - user.lastClick > 30 * 60 * 1000) {
      user.active = false;
      user.lastClick = 0;
      await user.save();

      try {
        await member.send('🚨 Timer stopped. Click IN again.');
      } catch {}
      continue;
    }

    user.total += 1;
    await user.save();
  }
}, 5 * 60 * 1000);

// ===== Deaf Detect =====
client.on('voiceStateUpdate', async (oldState, newState) => {
  const member = newState.member || oldState.member;
  const user = await getUser(member.id);

  if (user.active && newState.selfDeaf && !oldState.selfDeaf) {
    user.active = false;
    user.lastClick = 0;
    await user.save();

    try {
      await member.send('🚫 You deafened. Timer stopped.');
    } catch {}
  }
});

// ===== READY =====
client.once('ready', () => {
  console.log(`${client.user.tag} is online!`);
});

// ===== LOGIN =====
client.login(process.env.TOKEN);