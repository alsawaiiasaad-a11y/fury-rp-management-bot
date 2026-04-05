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
  AttachmentBuilder,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const fs = require('fs');
const path = require('path');

// ===== MongoDB =====
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ===== Schema =====
const userSchema = new mongoose.Schema({
  userId: String,
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
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const ASSIST_CHANNELS = (process.env.ASSIST_CHANNELS || '').split(',').filter(Boolean);

// ===== Cooldown =====
const cooldowns = new Map();
const COOLDOWN = 5000;

function checkCooldown(userId, cmd) {
  const key = `${userId}-${cmd}`;
  const now = Date.now();

  if (cooldowns.has(key)) {
    const expire = cooldowns.get(key);
    if (now < expire) return Math.ceil((expire - now) / 1000);
  }

  cooldowns.set(key, now + COOLDOWN);
  return null;
}

// ===== Helper =====
async function getUser(userId) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = new User({ userId });
    await user.save();
  }
  return user;
}

// ===== Logs =====
async function logAction(guild, text) {
  try {
    const ch = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (ch) ch.send(text);
  } catch {}
}

// ===== PANEL =====
async function sendPanel(channel) {
  const filePath = path.join(__dirname, 'assets', 'design.gif');
  if (!fs.existsSync(filePath)) return channel.send('❌ GIF missing');

  const attachment = new AttachmentBuilder(filePath);

  const embed = new EmbedBuilder()
    .setColor(0x00AEEF)
    .setTitle('💻 Fury Management System')
    .setDescription(
      "Click **In** to start working\n" +
      "⏱️ Click every 30 minutes\n" +
      "🚫 Deafened = stop"
    )
    .setImage('attachment://design.gif');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('in').setLabel('🟢 In').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('out').setLabel('🔴 Out').setStyle(ButtonStyle.Danger)
  );

  await channel.send({ embeds: [embed], files: [attachment], components: [row] });
}

// ===== SLASH COMMANDS =====
const commands = [
  new SlashCommandBuilder().setName('rank').setDescription('Your rank'),
  new SlashCommandBuilder().setName('top10').setDescription('Top 10'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Leaderboard'),
  new SlashCommandBuilder().setName('panel').setDescription('Send panel'),
  new SlashCommandBuilder()
    .setName('addpoints')
    .setDescription('Add points')
    .addUserOption(o => o.setName('user').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setRequired(true)),
  new SlashCommandBuilder()
    .setName('removepoints')
    .setDescription('Remove points')
    .addUserOption(o => o.setName('user').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setRequired(true)),
  new SlashCommandBuilder()
    .setName('setpoints')
    .setDescription('Set points')
    .addUserOption(o => o.setName('user').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setRequired(true))
].map(c => c.toJSON());

// ===== REGISTER =====
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log('✅ Slash commands ready');
})();

// ===== MESSAGE COMMANDS =====
client.on('messageCreate', async msg => {
  if (!msg.guild || msg.author.bot) return;
  if (!msg.content.startsWith('!')) return;

  const cmd = msg.content.trim().split(/\s+/)[0].toLowerCase();

  // ❌ ignore everything except these
  if (!['!rank', '!top10'].includes(cmd)) return;

  const cd = checkCooldown(msg.author.id, cmd);
  if (cd) return msg.reply(`⏳ Wait ${cd}s`);

  // ===== TOP10 =====
  if (cmd === '!top10') {
    const users = await User.find({ total: { $gt: 0 } })
      .sort({ total: -1 })
      .limit(10);

    let desc = users.length ? '' : 'No data yet';
    users.forEach((u, i) => {
      desc += `**#${i + 1}** <@${u.userId}> • ${u.total} pts\n`;
    });

    return msg.channel.send({
      embeds: [new EmbedBuilder().setColor(0x00AEEF).setTitle('🔥 Top 10').setDescription(desc)]
    });
  }

  // ===== RANK =====
  if (cmd === '!rank') {
    const user = await getUser(msg.author.id);
    return msg.reply(`⭐ You have ${user.total} points`);
  }
});

// ===== INTERACTIONS =====
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  // ===== BUTTONS =====
  if (interaction.isButton()) {
    const user = await getUser(interaction.user.id);
    const member = interaction.guild.members.cache.get(interaction.user.id);

    const inAssist = member?.voice.channelId && ASSIST_CHANNELS.includes(member.voice.channelId);
    if (!inAssist) return interaction.reply({ content: '❌ Join VC first', ephemeral: true });

    if (interaction.customId === 'in') {
      user.active = true;
      user.lastClick = Date.now();
      await user.save();
      return interaction.reply({ content: '✅ ACTIVE', ephemeral: true });
    }

    if (interaction.customId === 'out') {
      user.active = false;
      user.lastClick = 0;
      await user.save();
      return interaction.reply({ content: '🔴 OFFLINE', ephemeral: true });
    }
  }

  // ===== SLASH =====
  const cmd = interaction.commandName;

  const cd = checkCooldown(interaction.user.id, cmd);
  if (cd) return interaction.reply({ content: `⏳ Wait ${cd}s`, ephemeral: true });

  const isAdmin = interaction.member.permissions.has('Administrator');

  // ✅ ADMIN ONLY
  if (
    ['leaderboard','panel','addpoints','removepoints','setpoints'].includes(cmd) &&
    !isAdmin
  ) {
    return interaction.reply({ content: '❌ Admin only command', ephemeral: true });
  }

  // ===== PUBLIC =====
  if (cmd === 'rank') {
    const user = await getUser(interaction.user.id);
    return interaction.reply(`⭐ Points: ${user.total}`);
  }

  if (cmd === 'top10') {
    const users = await User.find().sort({ total: -1 }).limit(10);
    const txt = users.map((u, i) => `#${i+1} <@${u.userId}> • ${u.total}`).join('\n');
    return interaction.reply(txt || 'No data');
  }

  // ===== ADMIN =====
  if (cmd === 'leaderboard') {
    const users = await User.find().sort({ total: -1 });
    const txt = users.map((u, i) => `#${i+1} <@${u.userId}> • ${u.total}`).join('\n');
    return interaction.reply(txt);
  }

  if (cmd === 'panel') {
    await sendPanel(interaction.channel);
    return interaction.reply({ content: '✅ Panel sent', ephemeral: true });
  }

  if (['addpoints','removepoints','setpoints'].includes(cmd)) {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    let update;
    if (cmd === 'addpoints') update = { $inc: { total: amount } };
    if (cmd === 'removepoints') update = { $inc: { total: -amount } };
    if (cmd === 'setpoints') update = { $set: { total: amount } };

    await User.updateOne({ userId: target.id }, update, { upsert: true });

    await logAction(interaction.guild, `📊 ${cmd} → ${target.tag} (${amount})`);

    return interaction.reply(`✅ Done for ${target.tag}`);
  }
});

// ===== READY =====
client.once('ready', () => console.log(`${client.user.tag} is online`));

// ===== LOGIN =====
client.login(TOKEN);
