require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const axios = require('axios');

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

// GitHub API configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;

// Function to fetch current gist data
async function fetchGistData() {
    try {
        const response = await axios.get(`https://api.github.com/gists/${GIST_ID}`, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        // Get the first file in the gist (assuming it's the Lua file)
        const files = response.data.files;
        const firstFile = Object.keys(files)[0];
        return files[firstFile].content;
    } catch (error) {
        console.error('Error fetching gist:', error.response?.data || error.message);
        return null;
    }
}

// Function to update gist with new username
async function addUsernameToGist(username) {
    try {
        // Fetch current content
        const currentContent = await fetchGistData();
        if (!currentContent) return false;
        
        // Parse the Lua table and add new username
        const lines = currentContent.split('\n');
        const newLines = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            newLines.push(lines[i]);
            
            // Find the closing brace
            if (line === '}' && i === lines.length - 1) {
                // Insert new username before the closing brace
                newLines.pop(); // Remove the }
                newLines.push(`    "${username}",`);
                newLines.push('}');
            }
        }
        
        // Update the gist
        const updatedContent = newLines.join('\n');
        const filename = Object.keys((await axios.get(`https://api.github.com/gists/${GIST_ID}`, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
        })).data.files)[0];
        
        await axios.patch(`https://api.github.com/gists/${GIST_ID}`, {
            files: {
                [filename]: {
                    content: updatedContent
                }
            }
        }, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        return true;
    } catch (error) {
        console.error('Error updating gist:', error.response?.data || error.message);
        return false;
    }
}

// Function to check if username already exists
async function usernameExists(username) {
    try {
        const content = await fetchGistData();
        if (!content) return false;
        
        // Simple check for username in the content
        return content.includes(`"${username}"`);
    } catch (error) {
        console.error('Error checking username:', error);
        return false;
    }
}

// Event when bot is ready
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`Bot is ready to add Roblox usernames to your database!`);
});

// Handle messages
client.on('messageCreate', async message => {
    // Ignore messages from bots
    if (message.author.bot) return;
    
    // Simple command: !addusername <roblox_username>
    if (message.content.startsWith('!addusername ')) {
        const username = message.content.split(' ')[1]?.trim();
        
        if (!username) {
            return message.reply('Please provide a Roblox username. Usage: `!addusername <username>`');
        }
        
        // Basic validation
        if (username.length < 3 || username.length > 20) {
            return message.reply('Roblox username must be between 3 and 20 characters.');
        }
        
        // Check if username already exists
        const exists = await usernameExists(username);
        if (exists) {
            return message.reply(`Username "${username}" is already in the database.`);
        }
        
        // Send initial response
        const responseMsg = await message.reply(`Adding username "${username}" to database...`);
        
        // Add username to gist
        const success = await addUsernameToGist(username);
        
        if (success) {
            await responseMsg.edit(`✅ Successfully added **${username}** to the database!`);
            console.log(`Added username: ${username}`);
        } else {
            await responseMsg.edit('❌ Failed to add username to database. Please check bot logs.');
        }
    }
    
    // Command to check if username exists
    if (message.content.startsWith('!checkusername ')) {
        const username = message.content.split(' ')[1]?.trim();
        
        if (!username) {
            return message.reply('Usage: `!checkusername <username>`');
        }
        
        const exists = await usernameExists(username);
        if (exists) {
            message.reply(`✅ Username **${username}** exists in the database.`);
        } else {
            message.reply(`❌ Username **${username}** is not in the database.`);
        }
    }
    
    // Help command
    if (message.content === '!help') {
        message.reply(`
**Available Commands:**
\`!addusername <roblox_username>\` - Add a Roblox username to the database
\`!checkusername <roblox_username>\` - Check if a username exists in the database
\`!help\` - Show this help message
        `);
    }
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
