require('dotenv').config();

const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    PermissionsBitField, 
    EmbedBuilder, 
    Collection 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// ====== POINTS DATA ======
const pointsFile = path.join(__dirname, 'points.json');
let pointsData = {};
if (fs.existsSync(pointsFile)) pointsData = JSON.parse(fs.readFileSync(pointsFile, 'utf-8'));

// ====== COOLDOWNS ======
const cooldowns = new Collection();
const COOLDOWN = 5000; // 5 seconds per command

// ====== COMMANDS ======
client.commands = new Collection();

// Helper: Save points
function savePoints() {
    fs.writeFileSync(pointsFile, JSON.stringify(pointsData, null, 2));
}

// ====== LOG FUNCTION ======
function logAction(message) {
    const logChannel = message.guild.channels.cache.find(ch => ch.name === 'points-log');
    if (!logChannel) return;
    logChannel.send({ content: message });
}

// ====== ADMIN CHECK ======
function isAdmin(member) {
    return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

// ====== SLASH COMMAND REGISTRATION ======
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const guild = client.guilds.cache.get(process.env.GUILD_ID); 
    if (!guild) return console.error('Guild not found');

    await guild.commands.set([
        {
            name: 'rank',
            description: 'Show your points'
        },
        {
            name: 'leaderboard',
            description: 'Show top 10 points (Admin Only)'
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

// ====== INTERACTIONS ======
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, user, member } = interaction;

    // ====== COOLDOWN CHECK ======
    const now = Date.now();
    if (!cooldowns.has(user.id)) cooldowns.set(user.id, new Collection());
    const timestamps = cooldowns.get(user.id);

    if (timestamps.has(commandName)) {
        const expiration = timestamps.get(commandName) + COOLDOWN;
        if (now < expiration) {
            return interaction.reply({ content: `⏱ Please wait ${Math.ceil((expiration - now)/1000)}s before using this command again.`, ephemeral: true });
        }
    }
    timestamps.set(commandName, now);

    try {
        if (commandName === 'rank') {
            const pts = pointsData[user.id] || 0;
            return interaction.reply({ content: `🏆 You have **${pts} points**!`, ephemeral: true });
        }

        // ====== ADMIN COMMANDS ======
        if (!isAdmin(member)) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        if (commandName === 'leaderboard') {
            const sorted = Object.entries(pointsData)
                .sort(([,a],[,b]) => b-a)
                .slice(0, 10);
            let desc = '';
            for (let i = 0; i < sorted.length; i++) {
                const userId = sorted[i][0];
                const pts = sorted[i][1];
                const member = await interaction.guild.members.fetch(userId).catch(()=>null);
                const name = member ? member.user.tag : 'Unknown User';
                desc += `**${i+1}. ${name}** - ${pts} pts\n`;
            }
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏆 Top 10 Leaderboard').setDescription(desc)] });
        }

        if (commandName === 'addpoints') {
            const target = options.getUser('user');
            const amount = options.getInteger('amount');
            pointsData[target.id] = (pointsData[target.id] || 0) + amount;
            savePoints();
            logAction(`${user.tag} added ${amount} points to ${target.tag}`);
            return interaction.reply({ content: `✅ Added ${amount} points to ${target.tag}` });
        }

        if (commandName === 'removepoints') {
            const target = options.getUser('user');
            const amount = options.getInteger('amount');
            pointsData[target.id] = Math.max((pointsData[target.id] || 0) - amount, 0);
            savePoints();
            logAction(`${user.tag} removed ${amount} points from ${target.tag}`);
            return interaction.reply({ content: `✅ Removed ${amount} points from ${target.tag}` });
        }

        if (commandName === 'setpoints') {
            const target = options.getUser('user');
            const amount = options.getInteger('amount');
            pointsData[target.id] = amount;
            savePoints();
            logAction(`${user.tag} set ${target.tag} points to ${amount}`);
            return interaction.reply({ content: `✅ Set ${target.tag} points to ${amount}` });
        }

    } catch(err) {
        console.error(err);
        if (!interaction.replied) {
            await interaction.reply({ content: '❌ Something went wrong.', ephemeral: true });
        }
    }
});

// ====== LOGIN ======
client.login(process.env.TOKEN);
