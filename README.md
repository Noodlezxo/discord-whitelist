# Roblox Username Discord Bot

A Discord bot that manages Roblox usernames stored in a GitHub Gist.

## Setup

1. Clone this repository
2. Run `npm install`
3. Create a `.env` file with the required variables (see `.env.example`)
4. Run `npm start`

## Environment Variables

- `DISCORD_TOKEN` - Your Discord bot token
- `GITHUB_TOKEN` - GitHub Personal Access Token with "gist" scope
- `GIST_ID` - The ID of your gist containing the Lua database

## Commands

- `!add <username>` - Add a Roblox username
- `!check <username>` - Check if username exists
- `!list` - List all usernames
- `!count` - Show total count
- `!help` - Show help
- `!ping` - Check bot latency

## Deploying to Railway

1. Push this code to GitHub
2. Connect your repo to Railway
3. Add the environment variables in Railway dashboard
4. Deploy!
