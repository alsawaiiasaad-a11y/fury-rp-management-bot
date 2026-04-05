require('dotenv').config();

const { Client, GatewayIntentBits, Collection, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

// ----------------- DATA STORAGE -----------------
const pointsDataPath = path.join(__dirname, 'points.json');
let points = {};
if (fs.existsSync(pointsDataPath)) {
    points = JSON.parse(fs.readFileSync(pointsDataPath, 'utf8'));
}

const cooldowns = new Collection();

// ----------------- HELPER FUNCTIONS -----------------
function savePoints() {
    fs.writeFileSync(pointsDataPath, JSON.stringify(points, null, 2));
}

function addPoints(userId, amount) {
    if (!points[userId]) points[userId] = 0;
    points[userId] += amount;
    savePoints();
}

function removePoints(userId, amount) {
    if (!points[userId]) points[userId] = 0;
    points[userId] -= amount;
    if (points[userId] < 0) points[userId] = 0;
    savePoints();
}

function setPoints(userId, amount) {
    points[userId] = amount;
    savePoints();
}

function getTop10() {
    return Object.entries(points)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
}

// ----------------- LOGS CHANNEL -----------------
const LOGS_CHANNEL_ID = process.env.LOGS_CHANNEL_ID; // set in .env

function logAction(action, moderator, targetUser, amount) {
    const channel = client.channels.cache.get(LOGS_CHANNEL_ID);
    if (!channel) return;
    const embed = new EmbedBuilder()
        .setTitle('Points Log')
        .setColor('Blue')
        .setDescription(`${moderator} performed **${action}** on ${targetUser} with amount: ${amount}`)
        .setTimestamp();
    channel.send({ embeds: [embed] });
}

// ----------------- COMMANDS -----------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, user, member } = interaction;

    // ----------------- COOLDOWN -----------------
    const key = `${user.id}-${commandName}`;
    const now = Date.now();
    const cooldownAmount = 5 * 1000; // 5 seconds per command
    if (cooldowns.has(key)) {
        const expiration = cooldowns.get(key) + cooldownAmount;
        if (now < expiration) {
            return interaction.reply({ content: `⏱ Please wait before using this command again.`, ephemeral: true });
        }
    }
    cooldowns.set(key, now);
    setTimeout(() => cooldowns.delete(key), cooldownAmount);

    // ----------------- ADMIN CHECK -----------------
    const adminCommands = ['leaderboard', 'addpoints', 'removepoints', 'setpoints', 'panel'];
    const userCommands = ['rank', 'top10'];

    if (adminCommands.includes(commandName)) {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ You need admin permissions to use this command.', ephemeral: true });
        }
    }

    // ----------------- COMMAND LOGIC -----------------
    if (commandName === 'addpoints') {
        const target = options.getUser('user');
        const amount = options.getInteger('amount');
        addPoints(target.id, amount);
        logAction('ADD POINTS', user.tag, target.tag, amount);
        return interaction.reply(`✅ Added ${amount} points to ${target.tag}`);
    }

    if (commandName === 'removepoints') {
        const target = options.getUser('user');
        const amount = options.getInteger('amount');
        removePoints(target.id, amount);
        logAction('REMOVE POINTS', user.tag, target.tag, amount);
        return interaction.reply(`✅ Removed ${amount} points from ${target.tag}`);
    }

    if (commandName === 'setpoints') {
        const target = options.getUser('user');
        const amount = options.getInteger('amount');
        setPoints(target.id, amount);
        logAction('SET POINTS', user.tag, target.tag, amount);
        return interaction.reply(`✅ Set ${target.tag} points to ${amount}`);
    }

    if (commandName === 'leaderboard' || commandName === 'top10') {
        const top = getTop10();
        const embed = new EmbedBuilder()
            .setTitle('🏆 Top 10 Leaderboard')
            .setColor('Gold')
            .setDescription(top.map(([id, pts], i) => `${i + 1}. <@${id}> - ${pts} points`).join('\n'));
        return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'rank') {
        const target = options.getUser('user') || user;
        const pts = points[target.id] || 0;
        return interaction.reply(`${target.tag} has ${pts} points.`);
    }

    if (commandName === 'panel') {
        return interaction.reply({ content: '🎛 Panel functionality coming soon', ephemeral: true });
    }
});

// ----------------- DEPLOY SLASH COMMANDS -----------------
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const guildId = process.env.GUILD_ID;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return console.error('Guild not found.');

    await guild.commands.set([
        {
            name: 'addpoints',
            description: 'Add points to a user',
            options: [
                { type: 6, name: 'user', description: 'User to add points', required: true },
                { type: 4, name: 'amount', description: 'Points to add', required: true }
            ]
        },
        {
            name: 'removepoints',
            description: 'Remove points from a user',
            options: [
                { type: 6, name: 'user', description: 'User to remove points', required: true },
                { type: 4, name: 'amount', description: 'Points to remove', required: true }
            ]
        },
        {
            name: 'setpoints',
            description: 'Set points for a user',
            options: [
                { type: 6, name: 'user', description: 'User to set points', required: true },
                { type: 4, name: 'amount', description: 'Points to set', required: true }
            ]
        },
        {
            name: 'leaderboard',
            description: 'Show the leaderboard'
        },
        {
            name: 'top10',
            description: 'Show top 10 users'
        },
        {
            name: 'rank',
            description: 'Show your rank or another user',
            options: [
                { type: 6, name: 'user', description: 'User to check rank (optional)', required: false }
            ]
        },
        {
            name: 'panel',
            description: 'Admin panel commands'
        }
    ]);
});

// ----------------- LOGIN -----------------
client.login(process.env.TOKEN);
