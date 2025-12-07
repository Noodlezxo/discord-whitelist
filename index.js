require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionsBitField, Collection } = require('discord.js');
const axios = require('axios');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'roblox-username-bot' });
});

app.listen(PORT, () => {
    console.log(`✅ HTTP server on port ${PORT}`);
});

// Discord Bot Setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID || client.user?.id;

// Admin IDs - Add your Discord user IDs here
// To get your Discord ID: Enable Developer Mode in Discord > Right-click your name > Copy ID
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
const WHITELIST_CHANNEL_ID = process.env.WHITELIST_CHANNEL_ID; // Optional: restrict to specific channel

// Check env vars
if (!DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN missing');
    process.exit(1);
}

if (!GITHUB_TOKEN || !GIST_ID) {
    console.error('❌ GitHub config missing');
    process.exit(1);
}

// Helper function to check if user is admin
function isAdmin(userId) {
    return ADMIN_IDS.includes(userId);
}

// Helper function to check if user has admin permissions
function hasAdminPermissions(member) {
    return member.permissions.has(PermissionsBitField.Flags.Administrator) || 
           isAdmin(member.id);
}

// Define Slash Commands
const commands = [
    // Public commands
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Check if a Roblox username exists in the database')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('The Roblox username to check')
                .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('list')
        .setDescription('List all usernames in the database'),
    
    new SlashCommandBuilder()
        .setName('count')
        .setDescription('Show total number of usernames'),
    
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency'),
    
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show help information'),
    
    // Admin-only commands
    new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Admin commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a Roblox username to database (Admin only)')
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('The Roblox username to add')
                        .setRequired(true)
                        .setMinLength(3)
                        .setMaxLength(20)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a username from database (Admin only)')
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('The Roblox username to remove')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('whitelist')
                .setDescription('Whitelist management (Admin only)')
                .addSubcommandGroup(group =>
                    group
                        .setName('user')
                        .setDescription('User whitelist management')
                        .addSubcommand(sub =>
                            sub
                                .setName('add')
                                .setDescription('Add user to whitelist')
                                .addUserOption(option =>
                                    option.setName('user')
                                        .setDescription('User to whitelist')
                                        .setRequired(true)))
                        .addSubcommand(sub =>
                            sub
                                .setName('remove')
                                .setDescription('Remove user from whitelist')
                                .addUserOption(option =>
                                    option.setName('user')
                                        .setDescription('User to remove')
                                        .setRequired(true)))
                        .addSubcommand(sub =>
                            sub
                                .setName('list')
                                .setDescription('List whitelisted users')))
                .addSubcommandGroup(group =>
                    group
                        .setName('role')
                        .setDescription('Role whitelist management')
                        .addSubcommand(sub =>
                            sub
                                .setName('add')
                                .setDescription('Add role to whitelist')
                                .addRoleOption(option =>
                                    option.setName('role')
                                        .setDescription('Role to whitelist')
                                        .setRequired(true)))
                        .addSubcommand(sub =>
                            sub
                                .setName('remove')
                                .setDescription('Remove role from whitelist')
                                .addRoleOption(option =>
                                    option.setName('role')
                                        .setDescription('Role to remove')
                                        .setRequired(true)))
                        .addSubcommand(sub =>
                            sub
                                .setName('list')
                                .setDescription('List whitelisted roles'))))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Show bot statistics'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reload')
                .setDescription('Reload the username database'))
].map(command => command.toJSON());

// Whitelist storage (in-memory, persists until restart)
let whitelist = {
    users: new Set(ADMIN_IDS), // Admins are automatically whitelisted
    roles: new Set()
};

// Register Slash Commands
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

async function registerCommands() {
    try {
        console.log('🔄 Registering slash commands...');
        
        const clientId = CLIENT_ID || client.user?.id;
        if (!clientId) {
            console.log('⚠️ Client ID not found, will register after login');
            return;
        }
        
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands }
        );
        
        console.log('✅ Slash commands registered successfully!');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
}

// GitHub Functions
async function fetchGistData() {
    try {
        const response = await axios.get(`https://api.github.com/gists/${GIST_ID}`, {
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Roblox-Username-Bot'
            }
        });
        
        const files = response.data.files;
        const firstFile = Object.keys(files)[0];
        return {
            content: files[firstFile].content,
            filename: firstFile
        };
    } catch (error) {
        console.error('Error fetching gist:', error.message);
        return null;
    }
}

async function saveGistData(content) {
    try {
        const gistData = await fetchGistData();
        if (!gistData) throw new Error('Could not fetch gist');
        
        const { filename } = gistData;
        
        await axios.patch(`https://api.github.com/gists/${GIST_ID}`, {
            files: {
                [filename]: {
                    content: content
                }
            }
        }, {
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Roblox-Username-Bot'
            }
        });
        
        return true;
    } catch (error) {
        console.error('Error saving gist:', error.message);
        return false;
    }
}

async function addUsernameToGist(username) {
    try {
        const gistData = await fetchGistData();
        if (!gistData) throw new Error('Could not fetch gist');
        
        const { content } = gistData;
        const lines = content.split('\n');
        const newLines = [];
        let added = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.trim() === '}' && !added) {
                newLines.push(`    "${username}",`);
                added = true;
            }
            newLines.push(line);
        }
        
        if (!added) {
            newLines.push(`    "${username}",`);
            newLines.push('}');
        }
        
        const updatedContent = newLines.join('\n');
        const success = await saveGistData(updatedContent);
        
        if (success) {
            console.log(`✅ Added username: ${username}`);
        }
        return success;
    } catch (error) {
        console.error('Error adding username:', error.message);
        return false;
    }
}

async function removeUsernameFromGist(username) {
    try {
        const gistData = await fetchGistData();
        if (!gistData) throw new Error('Could not fetch gist');
        
        const { content } = gistData;
        const lines = content.split('\n');
        const newLines = [];
        let removed = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // Skip the line that contains the username
            if (trimmedLine === `"${username}"` || trimmedLine === `"${username}",`) {
                removed = true;
                continue; // Skip this line (remove it)
            }
            
            newLines.push(line);
        }
        
        if (!removed) {
            return { success: false, message: `Username "${username}" not found` };
        }
        
        const updatedContent = newLines.join('\n');
        const success = await saveGistData(updatedContent);
        
        if (success) {
            console.log(`✅ Removed username: ${username}`);
            return { success: true, message: `Removed "${username}"` };
        }
        return { success: false, message: 'Failed to save changes' };
    } catch (error) {
        console.error('Error removing username:', error.message);
        return { success: false, message: error.message };
    }
}

async function usernameExists(username) {
    try {
        const gistData = await fetchGistData();
        if (!gistData) return false;
        
        const pattern = new RegExp(`"${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`);
        return pattern.test(gistData.content);
    } catch (error) {
        console.error('Error checking username:', error);
        return false;
    }
}

async function listUsernames() {
    try {
        const gistData = await fetchGistData();
        if (!gistData) return null;
        
        const lines = gistData.content.split('\n');
        const usernames = [];
        
        for (const line of lines) {
            const match = line.match(/"([^"]+)"/);
            if (match && match[1]) {
                usernames.push(match[1]);
            }
        }
        
        return usernames;
    } catch (error) {
        console.error('Error listing usernames:', error);
        return null;
    }
}

// Helper function to check if user is whitelisted
function isWhitelisted(member) {
    // Check admin IDs first
    if (isAdmin(member.id)) return true;
    
    // Check user whitelist
    if (whitelist.users.has(member.id)) return true;
    
    // Check role whitelist
    for (const roleId of whitelist.roles) {
        if (member.roles.cache.has(roleId)) return true;
    }
    
    // Check admin permissions
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    
    return false;
}

// Bot Events
client.once('ready', async () => {
    console.log(`✅ Bot ready: ${client.user.tag}`);
    console.log(`📊 Servers: ${client.guilds.cache.size}`);
    console.log(`👑 Admins: ${ADMIN_IDS.join(', ') || 'None configured'}`);
    console.log(`👥 Whitelisted users: ${whitelist.users.size}`);
    console.log(`🎭 Whitelisted roles: ${whitelist.roles.size}`);
    
    // Register slash commands
    await registerCommands();
    
    // Set activity
    client.user.setActivity('/help | Whitelist system');
});

// Handle Slash Commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    
    // Check channel restriction
    if (WHITELIST_CHANNEL_ID && interaction.channelId !== WHITELIST_CHANNEL_ID) {
        return interaction.reply({
            content: `❌ This command can only be used in <#${WHITELIST_CHANNEL_ID}>`,
            ephemeral: true
        });
    }
    
    // Check for admin commands
    if (interaction.commandName === 'admin') {
        if (!isWhitelisted(interaction.member)) {
            return interaction.reply({
                content: '❌ You do not have permission to use admin commands.',
                ephemeral: true
            });
        }
    }
    
    // Defer reply for longer operations
    await interaction.deferReply({ ephemeral: interaction.commandName === 'admin' });
    
    const { commandName, options } = interaction;
    
    try {
        switch (commandName) {
            case 'check': {
                const username = options.getString('username');
                const exists = await usernameExists(username);
                
                if (exists) {
                    await interaction.editReply(`✅ **${username}** exists in database.`);
                } else {
                    await interaction.editReply(`❌ **${username}** not found.`);
                }
                break;
            }
            
            case 'list': {
                const usernames = await listUsernames();
                
                if (!usernames || usernames.length === 0) {
                    return interaction.editReply('❌ No usernames found.');
                }
                
                if (usernames.length <= 15) {
                    const list = usernames.map(u => `• ${u}`).join('\n');
                    await interaction.editReply(`📋 **Usernames (${usernames.length}):**\n${list}`);
                } else {
                    const firstTen = usernames.slice(0, 10);
                    const list = firstTen.map(u => `• ${u}`).join('\n');
                    await interaction.editReply(`📋 **First 10 of ${usernames.length}:**\n${list}\n...and ${usernames.length - 10} more`);
                }
                break;
            }
            
            case 'count': {
                const usernames = await listUsernames();
                
                if (!usernames) {
                    return interaction.editReply('❌ Could not fetch database.');
                }
                
                await interaction.editReply(`📊 **Total usernames:** ${usernames.length}`);
                break;
            }
            
            case 'ping': {
                const latency = Date.now() - interaction.createdTimestamp;
                const uptime = process.uptime();
                const hours = Math.floor(uptime / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                const seconds = Math.floor(uptime % 60);
                
                await interaction.editReply(`🏓 Pong!\n• Latency: ${latency}ms\n• API: ${Math.round(client.ws.ping)}ms\n• Uptime: ${hours}h ${minutes}m ${seconds}s`);
                break;
            }
            
            case 'help': {
                const helpMessage = `
🤖 **Roblox Username Bot**

**Public Commands:**
\`/check <username>\` - Check if username exists
\`/list\` - Show usernames
\`/count\` - Show total count
\`/ping\` - Check bot status
\`/help\` - This message

**Admin Commands:**
\`/admin add <username>\` - Add username
\`/admin remove <username>\` - Remove username
\`/admin whitelist\` - Manage whitelist
\`/admin stats\` - Bot statistics
\`/admin reload\` - Reload database

**Note:** Admin commands require whitelist access.
                `;
                
                await interaction.editReply(helpMessage);
                break;
            }
            
            case 'admin': {
                const subcommand = options.getSubcommand();
                const subcommandGroup = options.getSubcommandGroup();
                
                // Admin Add Username
                if (subcommand === 'add') {
                    const username = options.getString('username');
                    
                    if (username.length < 3 || username.length > 20) {
                        return interaction.editReply('❌ Username must be 3-20 characters.');
                    }
                    
                    const exists = await usernameExists(username);
                    if (exists) {
                        return interaction.editReply(`❌ **${username}** already exists.`);
                    }
                    
                    const success = await addUsernameToGist(username);
                    
                    if (success) {
                        await interaction.editReply(`✅ **${username}** added successfully!`);
                    } else {
                        await interaction.editReply('❌ Failed to add username.');
                    }
                }
                
                // Admin Remove Username
                else if (subcommand === 'remove') {
                    const username = options.getString('username');
                    const result = await removeUsernameFromGist(username);
                    
                    if (result.success) {
                        await interaction.editReply(`✅ ${result.message}`);
                    } else {
                        await interaction.editReply(`❌ ${result.message}`);
                    }
                }
                
                // Admin Whitelist Management
                else if (subcommand === 'whitelist') {
                    if (subcommandGroup === 'user') {
                        const userSub = options.getSubcommand();
                        const user = options.getUser('user');
                        
                        if (userSub === 'add') {
                            whitelist.users.add(user.id);
                            await interaction.editReply(`✅ Added ${user.tag} to whitelist.`);
                        } else if (userSub === 'remove') {
                            whitelist.users.delete(user.id);
                            await interaction.editReply(`✅ Removed ${user.tag} from whitelist.`);
                        } else if (userSub === 'list') {
                            const userList = Array.from(whitelist.users).map(id => `<@${id}>`).join('\n') || 'None';
                            await interaction.editReply(`**👥 Whitelisted Users:**\n${userList}\n\n**Total:** ${whitelist.users.size}`);
                        }
                    } else if (subcommandGroup === 'role') {
                        const roleSub = options.getSubcommand();
                        const role = options.getRole('role');
                        
                        if (roleSub === 'add') {
                            whitelist.roles.add(role.id);
                            await interaction.editReply(`✅ Added role **${role.name}** to whitelist.`);
                        } else if (roleSub === 'remove') {
                            whitelist.roles.delete(role.id);
                            await interaction.editReply(`✅ Removed role **${role.name}** from whitelist.`);
                        } else if (roleSub === 'list') {
                            const roleList = Array.from(whitelist.roles).map(id => `<@&${id}>`).join('\n') || 'None';
                            await interaction.editReply(`**🎭 Whitelisted Roles:**\n${roleList}\n\n**Total:** ${whitelist.roles.size}`);
                        }
                    }
                }
                
                // Admin Stats
                else if (subcommand === 'stats') {
                    const usernames = await listUsernames();
                    const usernameCount = usernames ? usernames.length : 0;
                    
                    const stats = `
📊 **Bot Statistics**
• **Usernames in DB:** ${usernameCount}
• **Whitelisted Users:** ${whitelist.users.size}
• **Whitelisted Roles:** ${whitelist.roles.size}
• **Admin Users:** ${ADMIN_IDS.length}
• **Guilds:** ${client.guilds.cache.size}
• **Uptime:** ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m
• **Memory:** ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB
                    `;
                    
                    await interaction.editReply(stats);
                }
                
                // Admin Reload
                else if (subcommand === 'reload') {
                    const usernames = await listUsernames();
                    if (usernames) {
                        await interaction.editReply(`✅ Database reloaded. Found ${usernames.length} usernames.`);
                    } else {
                        await interaction.editReply('❌ Failed to reload database.');
                    }
                }
                
                break;
            }
        }
    } catch (error) {
        console.error('Command error:', error);
        await interaction.editReply('❌ An error occurred. Please try again.');
    }
});

// Error handling
client.on('error', console.error);
process.on('unhandledRejection', console.error);

// Login
console.log('🚀 Starting bot...');
client.login(DISCORD_TOKEN);
