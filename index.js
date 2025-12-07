require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

// Create Express app for healthcheck
const app = express();
const PORT = process.env.PORT || 3000;

// Simple healthcheck endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'roblox-username-bot',
        timestamp: new Date().toISOString()
    });
});

// Start HTTP server
app.listen(PORT, () => {
    console.log(`✅ HTTP server listening on port ${PORT}`);
});

// Discord Bot Setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

// Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;

// Check environment variables
console.log('🔧 Checking environment variables...');
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ ERROR: DISCORD_TOKEN is not set!');
    process.exit(1);
} else {
    console.log('✅ DISCORD_TOKEN: Set');
}

if (!GITHUB_TOKEN) {
    console.error('❌ ERROR: GITHUB_TOKEN is not set!');
    process.exit(1);
} else {
    console.log('✅ GITHUB_TOKEN: Set');
}

if (!GIST_ID) {
    console.error('❌ ERROR: GIST_ID is not set!');
    process.exit(1);
} else {
    console.log(`✅ GIST_ID: ${GIST_ID}`);
}

// Store bot status for healthcheck
let botStatus = {
    ready: false,
    lastActivity: null,
    usernameCount: 0,
    lastUpdate: null
};

// Function to fetch current gist data
async function fetchGistData() {
    try {
        console.log(`📥 Fetching gist data...`);
        const response = await axios.get(`https://api.github.com/gists/${GIST_ID}`, {
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Roblox-Username-Bot'
            }
        });
        
        const files = response.data.files;
        const firstFile = Object.keys(files)[0];
        console.log(`✅ Gist fetched successfully`);
        return {
            content: files[firstFile].content,
            filename: firstFile
        };
    } catch (error) {
        console.error('❌ Error fetching gist:', error.message);
        return null;
    }
}

// Function to add username to gist
async function addUsernameToGist(username) {
    try {
        console.log(`➕ Adding username: ${username}`);
        
        const gistData = await fetchGistData();
        if (!gistData || !gistData.content) {
            throw new Error('Could not fetch current gist data');
        }
        
        const { content, filename } = gistData;
        const lines = content.split('\n');
        const newLines = [];
        let added = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check if this is the closing brace line
            if (line.trim() === '}' && !added) {
                newLines.push(`    "${username}",`);
                added = true;
            }
            
            newLines.push(line);
        }
        
        // If we didn't find a closing brace, add it properly
        if (!added) {
            newLines.push(`    "${username}",`);
            newLines.push('}');
        }
        
        const updatedContent = newLines.join('\n');
        
        // Update the gist
        await axios.patch(`https://api.github.com/gists/${GIST_ID}`, {
            files: {
                [filename]: {
                    content: updatedContent
                }
            }
        }, {
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Roblox-Username-Bot'
            }
        });
        
        console.log(`✅ Successfully added: ${username}`);
        botStatus.lastUpdate = new Date().toISOString();
        return true;
    } catch (error) {
        console.error('❌ Error updating gist:', error.message);
        return false;
    }
}

// Function to check if username exists
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

// Function to list all usernames
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
        
        botStatus.usernameCount = usernames.length;
        return usernames;
    } catch (error) {
        console.error('Error listing usernames:', error);
        return null;
    }
}

// Bot ready event
client.once('ready', async () => {
    console.log(`\n🤖 Bot is ready!`);
    console.log(`📛 Logged in as: ${client.user.tag}`);
    console.log(`🆔 User ID: ${client.user.id}`);
    console.log(`📊 Serving ${client.guilds.cache.size} servers`);
    console.log(`🔗 Invite URL: https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot&permissions=274878024704`);
    
    botStatus.ready = true;
    botStatus.lastActivity = new Date().toISOString();
    
    // Update username count on startup
    const usernames = await listUsernames();
    if (usernames) {
        console.log(`📋 Total usernames in database: ${usernames.length}`);
    }
    
    // Set bot activity
    client.user.setActivity('!help | Adding Roblox usernames');
});

// Handle messages
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    botStatus.lastActivity = new Date().toISOString();
    
    // Command: !add <username>
    if (message.content.startsWith('!add ')) {
        const username = message.content.slice(5).trim();
        
        if (!username) {
            return message.reply('❌ Usage: `!add <roblox_username>`');
        }
        
        if (username.length < 3 || username.length > 20) {
            return message.reply('❌ Username must be 3-20 characters.');
        }
        
        // Check if exists
        const exists = await usernameExists(username);
        if (exists) {
            return message.reply(`❌ **${username}** already exists.`);
        }
        
        const processingMsg = await message.reply(`⏳ Adding **${username}**...`);
        const success = await addUsernameToGist(username);
        
        if (success) {
            await processingMsg.edit(`✅ **${username}** added successfully!`);
        } else {
            await processingMsg.edit('❌ Failed to add username.');
        }
    }
    
    // Command: !check <username>
    if (message.content.startsWith('!check ')) {
        const username = message.content.slice(7).trim();
        
        if (!username) {
            return message.reply('Usage: `!check <username>`');
        }
        
        const exists = await usernameExists(username);
        if (exists) {
            message.reply(`✅ **${username}** exists.`);
        } else {
            message.reply(`❌ **${username}** not found.`);
        }
    }
    
    // Command: !list
    if (message.content === '!list') {
        const usernames = await listUsernames();
        
        if (!usernames || usernames.length === 0) {
            return message.reply('❌ No usernames found.');
        }
        
        if (usernames.length <= 10) {
            message.reply(`📋 **Usernames (${usernames.length}):**\n${usernames.map(u => `• ${u}`).join('\n')}`);
        } else {
            // Show first 10 only if many
            const firstTen = usernames.slice(0, 10);
            message.reply(`📋 **First 10 of ${usernames.length} usernames:**\n${firstTen.map(u => `• ${u}`).join('\n')}\n*Use !count for total*`);
        }
    }
    
    // Command: !count
    if (message.content === '!count') {
        const usernames = await listUsernames();
        
        if (!usernames) {
            return message.reply('❌ Could not fetch database.');
        }
        
        message.reply(`📊 **Total usernames:** ${usernames.length}`);
    }
    
    // Command: !help
    if (message.content === '!help') {
        const helpMessage = `
🤖 **Roblox Username Bot**

**Commands:**
\`!add <username>\` - Add Roblox username
\`!check <username>\` - Check if exists
\`!list\` - Show usernames
\`!count\` - Show total count
\`!help\` - This message
\`!ping\` - Check bot status

**Note:** Usernames are case-sensitive (3-20 chars)
        `;
        
        message.reply(helpMessage);
    }
    
    // Command: !ping
    if (message.content === '!ping') {
        const latency = Date.now() - message.createdTimestamp;
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        
        message.reply(`🏓 Pong! 
• Latency: ${latency}ms 
• API: ${Math.round(client.ws.ping)}ms
• Uptime: ${hours}h ${minutes}m ${seconds}s
• Status: ${botStatus.ready ? '✅ Ready' : '❌ Not ready'}`);
    }
    
    // Command: !status (admin)
    if (message.content === '!status') {
        const usernames = await listUsernames();
        const statusMessage = `
🤖 **Bot Status**
• Ready: ${botStatus.ready ? '✅' : '❌'}
• Last Activity: ${botStatus.lastActivity || 'Never'}
• Usernames: ${usernames ? usernames.length : 'Unknown'}
• Last Update: ${botStatus.lastUpdate || 'Never'}
• Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB
        `;
        
        message.reply(statusMessage);
    }
});

// Error handling
client.on('error', console.error);
client.on('warn', console.warn);

process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});

// Healthcheck endpoint with bot status
app.get('/health', (req, res) => {
    res.json({
        status: botStatus.ready ? 'healthy' : 'starting',
        bot: {
            ready: botStatus.ready,
            usernameCount: botStatus.usernameCount,
            lastActivity: botStatus.lastActivity,
            uptime: process.uptime()
        },
        timestamp: new Date().toISOString()
    });
});

// Start the bot
console.log('🚀 Starting Roblox Username Bot...');

// Login to Discord
client.login(process.env.DISCORD_TOKEN).then(() => {
    console.log('🔑 Logging in to Discord...');
}).catch(error => {
    console.error('❌ Failed to login:', error);
    process.exit(1);
});
