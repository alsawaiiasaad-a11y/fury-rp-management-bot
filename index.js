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

// ===== COMMANDS =====
client.on('messageCreate', async msg => {
  if (!msg.guild || msg.author.bot) return;
  if (!msg.content.startsWith('!')) return;

  const args = msg.content.trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const isUserAdmin = isAdmin(msg.member);

  // ✅ ONLY THESE NEED ADMIN
  const adminOnly = [
    '!leaderboard',
    '!panel',
    '!resetpoints',
    '!addpoints',
    '!removepoints',
    '!setpoints'
  ];

  if (adminOnly.includes(cmd) && !isUserAdmin) {
    return msg.reply('❌ Admin only command');
  }

  // ===== TOP 10 =====
  if (cmd === '!top10') {
    const users = await User.find({ total: { $gt: 0 } })
      .sort({ total: -1 })
      .limit(10);

    let desc = users.length ? '' : 'No data yet';
    users.forEach((u, i) => {
      desc += `**#${i + 1}** <@${u.userId}> • ${u.total} pts\n`;
    });

    return msg.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00AEEF)
          .setTitle('🔥 Top 10')
          .setDescription(desc)
      ]
    });
  }

  // ===== RANK =====
  if (cmd === '!rank') {
    const user = await getUser(msg.author.id);
    const users = await User.find({ total: { $gt: 0 } }).sort({ total: -1 });
    const rank = users.findIndex(u => u.userId === msg.author.id) + 1;

    return msg.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00FFAA)
          .setTitle('📊 Your Stats')
          .setThumbnail(msg.author.displayAvatarURL())
          .addFields(
            { name: '🏆 Rank', value: rank ? `#${rank}` : 'Unranked', inline: true },
            { name: '⭐ Points', value: `${user.total}`, inline: true },
            { name: '📡 Status', value: user.active ? '🟢 Active' : '⚫ Inactive', inline: true }
          )
      ]
    });
  }

  // ===== LEADERBOARD =====
  if (cmd === '!leaderboard') {
    const users = await User.find({ total: { $gt: 0 } }).sort({ total: -1 });
    if (!users.length) return msg.channel.send('No one has points yet 👀');

    let desc = '';
    users.forEach((u, i) => {
      desc += `**#${i + 1}** <@${u.userId}> • ${u.total} pts\n`;
    });

    return msg.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle(`🏆 Leaderboard`)
          .setDescription(desc)
      ]
    });
  }

  // ===== PANEL =====
  if (cmd === '!panel') return sendPanel(msg.channel);

  // ===== RESET =====
  if (cmd === '!resetpoints') {
    await User.updateMany({}, { total: 0 });
    return msg.reply("✅ All points reset");
  }

  // ===== POINT COMMANDS =====
  if (['!addpoints', '!removepoints', '!setpoints'].includes(cmd)) {
    const mention = msg.mentions.users.first();
    const points = parseInt(args[2]);

    if (!mention || isNaN(points)) {
      return msg.reply(`Usage: ${cmd} @user 50`);
    }

    if (cmd === '!addpoints') {
      await User.updateOne({ userId: mention.id }, { $inc: { total: points } }, { upsert: true });
    }

    if (cmd === '!removepoints') {
      await User.updateOne({ userId: mention.id }, { $inc: { total: -points } });
    }

    if (cmd === '!setpoints') {
      await User.updateOne({ userId: mention.id }, { $set: { total: points } }, { upsert: true });
    }

    return msg.reply(`✅ Updated points for <@${mention.id}>`);
  }
});

// ===== BUTTONS =====
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const user = await getUser(interaction.user.id);
  const member = interaction.guild.members.cache.get(interaction.user.id);

  const inAssist = member?.voice.channelId && ASSIST_CHANNELS.includes(member.voice.channelId);
  const isDeafened = member?.voice.selfDeaf;
  const isMuted = member?.voice.selfMute;

  if (!inAssist) return interaction.reply({ content: '❌ Join assist VC first', ephemeral: true });
  if (isDeafened || isMuted) return interaction.reply({ content: '🚫 Cannot sign IN while deafened', ephemeral: true });

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

// ===== VOICE =====
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
