require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

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

// Check if required environment variables are set
if (!process.env.DISCORD_TOKEN) {
    console.error('ERROR: DISCORD_TOKEN is not set in environment variables!');
    process.exit(1);
}

if (!GITHUB_TOKEN) {
    console.error('ERROR: GITHUB_TOKEN is not set in environment variables!');
    process.exit(1);
}

if (!GIST_ID) {
    console.error('ERROR: GIST_ID is not set in environment variables!');
    process.exit(1);
}

// Function to fetch current gist data
async function fetchGistData() {
    try {
        console.log(`Fetching gist data from ID: ${GIST_ID}`);
        const response = await axios.get(`https://api.github.com/gists/${GIST_ID}`, {
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Roblox-Username-Bot'
            }
        });
        
        console.log('Successfully fetched gist data');
        const files = response.data.files;
        const firstFile = Object.keys(files)[0];
        return {
            content: files[firstFile].content,
            filename: firstFile
        };
    } catch (error) {
        console.error('Error fetching gist:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
        return null;
    }
}

// Function to add username to gist
async function addUsernameToGist(username) {
    try {
        console.log(`Attempting to add username: ${username}`);
        
        // Fetch current data
        const gistData = await fetchGistData();
        if (!gistData || !gistData.content) {
            throw new Error('Could not fetch current gist data');
        }
        
        const { content, filename } = gistData;
        const lines = content.split('\n');
        const newLines = [];
        let added = false;
        
        // Process each line
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check if this is the closing brace line
            if (line.trim() === '}' && !added) {
                // Add the new username before the closing brace
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
        console.log(`Updating gist file: ${filename}`);
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
        
        console.log(`Successfully added username: ${username}`);
        return true;
    } catch (error) {
        console.error('Error updating gist:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data));
        }
        return false;
    }
}

// Function to check if username exists
async function usernameExists(username) {
    try {
        const gistData = await fetchGistData();
        if (!gistData) return false;
        
        // Check if username is in the content (case-sensitive)
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
        
        return usernames;
    } catch (error) {
        console.error('Error listing usernames:', error);
        return null;
    }
}

// Bot ready event
client.once('ready', () => {
    console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
    console.log(`📊 Serving ${client.guilds.cache.size} servers`);
    console.log(`👤 Bot is online and ready to receive commands`);
});

// Handle messages
client.on('messageCreate', async (message) => {
    // Ignore messages from bots
    if (message.author.bot) return;
    
    // Command: !add <username>
    if (message.content.startsWith('!add ')) {
        const username = message.content.slice(5).trim();
        
        if (!username) {
            return message.reply('❌ Please provide a username. Usage: `!add <roblox_username>`');
        }
        
        // Validate username
        if (username.length < 3 || username.length > 20) {
            return message.reply('❌ Username must be between 3 and 20 characters.');
        }
        
        // Check if exists
        const exists = await usernameExists(username);
        if (exists) {
            return message.reply(`❌ Username **${username}** is already in the database.`);
        }
        
        // Send processing message
        const processingMsg = await message.reply(`⏳ Adding **${username}** to database...`);
        
        // Add to gist
        const success = await addUsernameToGist(username);
        
        if (success) {
            await processingMsg.edit(`✅ Successfully added **${username}** to the database!`);
        } else {
            await processingMsg.edit('❌ Failed to add username. Please try again later.');
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
            message.reply(`✅ **${username}** exists in the database.`);
        } else {
            message.reply(`❌ **${username}** is not in the database.`);
        }
    }
    
    // Command: !list
    if (message.content === '!list') {
        const processingMsg = await message.reply('⏳ Fetching usernames...');
        
        const usernames = await listUsernames();
        
        if (!usernames || usernames.length === 0) {
            return processingMsg.edit('❌ No usernames found in database.');
        }
        
        if (usernames.length <= 10) {
            processingMsg.edit(`📋 **Usernames in database:**\n${usernames.map(u => `• ${u}`).join('\n')}\n\n**Total:** ${usernames.length}`);
        } else {
            processingMsg.edit(`📋 **Total usernames:** ${usernames.length}\n(Use !count for exact count)`);
        }
    }
    
    // Command: !count
    if (message.content === '!count') {
        const usernames = await listUsernames();
        
        if (!usernames) {
            return message.reply('❌ Could not fetch database.');
        }
        
        message.reply(`📊 **Total usernames in database:** ${usernames.length}`);
    }
    
    // Command: !help
    if (message.content === '!help') {
        const helpMessage = `
🤖 **Roblox Username Bot Commands:**

\`!add <username>\` - Add a Roblox username to the database
\`!check <username>\` - Check if a username exists
\`!list\` - Show all usernames (truncated if many)
\`!count\` - Show total number of usernames
\`!help\` - Show this help message

**Note:** Usernames are case-sensitive and must be 3-20 characters.
        `;
        
        message.reply(helpMessage);
    }
    
    // Command: !ping
    if (message.content === '!ping') {
        const latency = Date.now() - message.createdTimestamp;
        message.reply(`🏓 Pong! Latency: ${latency}ms | API: ${Math.round(client.ws.ping)}ms`);
    }
});

// Error handling
client.on('error', console.error);
process.on('unhandledRejection', console.error);

// Login
console.log('Starting bot...');
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('Failed to login:', error);
    process.exit(1);
});
