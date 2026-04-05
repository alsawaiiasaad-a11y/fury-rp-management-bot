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
  userId: { type: String, unique: true },
  total: { type: Number, default: 0 },
  active: { type: Boolean, default: false },
  lastClick: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// ===== Bot =====
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

// ===== Admin Check =====
function isAdmin(member) {
  return member.permissions.has('Administrator');
}

// ===== Buttons =====
const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('in').setLabel('🟢 In').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId('out').setLabel('🔴 Out').setStyle(ButtonStyle.Danger)
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

// ===== PANEL =====
async function sendPanel(channel) {
  const filePath = path.join(__dirname, 'assets', 'design.gif');

  if (!fs.existsSync(filePath)) {
    return channel.send("❌ Panel GIF missing");
  }

  const attachment = new AttachmentBuilder(filePath);

  const embed = new EmbedBuilder()
    .setColor(0x00AEEF)
    .setTitle('💻 Fury Management System')
    .setDescription(
      "Click **In** to start working\n" +
      "⏱️ Click every 30 minutes to stay active\n" +
      "🚫 Deafened = auto stop"
    )
    .setImage('attachment://design.gif')
    .setFooter({ text: 'Fury RP System' });

  await channel.send({ embeds: [embed], files: [attachment], components: [row] });
}

// ===== COMMANDS (SLASH) =====
client.on('ready', async () => {
  console.log(`${client.user.tag} is online`);

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return console.error('Guild not found');

  await guild.commands.set([
    {
      name: 'rank',
      description: 'Show your points'
    },
    {
      name: 'top10',
      description: 'Show top 10 points'
    },
    {
      name: 'leaderboard',
      description: 'Show all points (Admin Only)'
    },
    {
      name: 'panel',
      description: 'Show assist panel (Admin Only)'
    },
    {
      name: 'addpoints',
      description: 'Add points to a user (Admin Only)',
      options: [
        { name: 'user', type: 6, description: 'Select a user', required: true },
        { name: 'amount', type: 4, description: 'Points to add', required: true }
      ]
    },
    {
      name: 'removepoints',
      description: 'Remove points from a user (Admin Only)',
      options: [
        { name: 'user', type: 6, description: 'Select a user', required: true },
        { name: 'amount', type: 4, description: 'Points to remove', required: true }
      ]
    },
    {
      name: 'setpoints',
      description: 'Set points of a user (Admin Only)',
      options: [
        { name: 'user', type: 6, description: 'Select a user', required: true },
        { name: 'amount', type: 4, description: 'Points to set', required: true }
      ]
    }
  ]);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  // ===== BUTTONS =====
  if (interaction.isButton()) {
    const user = await getUser(interaction.user.id);
    const member = interaction.guild.members.cache.get(interaction.user.id);

    const inAssist = member?.voice.channelId && ASSIST_CHANNELS.includes(member.voice.channelId);
    const isDeafened = member?.voice.selfDeaf;

    if (!inAssist) return interaction.reply({ content: '❌ Join assist VC first', ephemeral: true });
    if (isDeafened) return interaction.reply({ content: '🚫 Cannot sign IN while deafened', ephemeral: true });

    if (interaction.customId === 'in') {
      if (user.active) return interaction.reply({ content: '⚠️ You are already IN', ephemeral: true });
      user.active = true;
      user.lastClick = Date.now();
      await user.save();
      return interaction.reply({ content: '✅ You are now ACTIVE', ephemeral: true });
    }

    if (interaction.customId === 'out') {
      if (!user.active) return interaction.reply({ content: '⚠️ You are not IN', ephemeral: true });
      user.active = false;
      user.lastClick = 0;
      await user.save();
      return interaction.reply({ content: '🔴 You are now OFFLINE', ephemeral: true });
    }

    return;
  }

  // ===== SLASH COMMANDS =====
  const { commandName, options, user, member } = interaction;

  // ===== ADMIN ONLY =====
  const adminCmds = ['leaderboard', 'panel', 'addpoints', 'removepoints', 'setpoints'];
  if (adminCmds.includes(commandName) && !isAdmin(member)) {
    return interaction.reply({ content: '❌ Admin only command', ephemeral: true });
  }

  try {
    // ===== RANK =====
    if (commandName === 'rank') {
      const userData = await getUser(user.id);
      const users = await User.find({ total: { $gt: 0 } }).sort({ total: -1 });
      const rank = users.findIndex(u => u.userId === user.id) + 1;

      const embed = new EmbedBuilder()
        .setColor(0x00FFAA)
        .setTitle('📊 Your Stats')
        .setThumbnail(interaction.guild.iconURL() || user.displayAvatarURL())
        .addFields(
          { name: '🏆 Rank', value: rank ? `#${rank}` : 'Unranked', inline: true },
          { name: '⭐ Points', value: `${userData.total}`, inline: true },
          { name: '📡 Status', value: userData.active ? '🟢 Active' : '⚫ Inactive', inline: true }
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ===== TOP 10 =====
    if (commandName === 'top10') {
      const users = await User.find({ total: { $gt: 0 } }).sort({ total: -1 }).limit(10);
      let desc = users.length ? '' : 'No data yet';
      users.forEach((u, i) => desc += `**#${i + 1}** <@${u.userId}> • ${u.total} pts\n`);

      const embed = new EmbedBuilder()
        .setColor(0x00AEEF)
        .setTitle('🔥 Top 10')
        .setDescription(desc);

      return interaction.reply({ embeds: [embed] });
    }

    // ===== LEADERBOARD =====
    if (commandName === 'leaderboard') {
      const users = await User.find({ total: { $gt: 0 } }).sort({ total: -1 });
      if (!users.length) return interaction.reply({ content: 'No one has points yet 👀' });

      let desc = '';
      users.forEach((u, i) => desc += `**#${i + 1}** <@${u.userId}> • ${u.total} pts\n`);

      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🏆 Leaderboard')
        .setDescription(desc);

      return interaction.reply({ embeds: [embed] });
    }

    // ===== PANEL =====
    if (commandName === 'panel') return sendPanel(interaction.channel);

    // ===== POINTS ADMIN =====
    if (['addpoints', 'removepoints', 'setpoints'].includes(commandName)) {
      const target = options.getUser('user');
      const amount = options.getInteger('amount');

      if (commandName === 'addpoints') await User.updateOne({ userId: target.id }, { $inc: { total: amount } }, { upsert: true });
      if (commandName === 'removepoints') await User.updateOne({ userId: target.id }, { $inc: { total: -amount } });
      if (commandName === 'setpoints') await User.updateOne({ userId: target.id }, { $set: { total: amount } }, { upsert: true });

      return interaction.reply({ content: `✅ Updated points for <@${target.id}>` });
    }

  } catch(err) {
    console.error(err);
    if (!interaction.replied) await interaction.reply({ content: '❌ Something went wrong', ephemeral: true });
  }
});

// ===== TIMER =====
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
      try { await member.send('🚨 You were signed OUT. Click IN again.'); } catch {}
      continue;
    }

    user.total += 1;
    await user.save();
  }

  console.log('⏱️ Timer updated');
}, 5 * 60 * 1000);

// ===== VOICE STATE =====
client.on('voiceStateUpdate', async (oldState, newState) => {
  const member = newState.member || oldState.member;
  const user = await getUser(member.id);

  if (user.active && newState.selfDeaf && !oldState.selfDeaf) {
    user.active = false;
    user.lastClick = 0;
    await user.save();
    try { await member.send('🚫 You deafened. Timer stopped.'); } catch {}
  }

  if (user.active && oldState.channelId && !newState.channelId) {
    user.active = false;
    user.lastClick = 0;
    await user.save();
    try { await member.send('🚨 You left the assist VC. Timer stopped.'); } catch {}
  }

  if (user.active && oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    user.active = false;
    user.lastClick = 0;
    await user.save();
    try { await member.send('⚠️ You switched voice channels. Timer stopped.'); } catch {}
  }
});

// ===== READY =====
client.once('ready', () => console.log(`${client.user.tag} is online`));

// ===== LOGIN =====
client.login(TOKEN);
