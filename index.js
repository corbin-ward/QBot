const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { initializeApp } = require('firebase/app');
const admin = require('firebase-admin');
const { token } = require('./config/discord.js.json');
const firebaseConfig = require('./config/firebase.json');
const serviceAccount = require("./config/firebase-admin.json");

const { saveQueueData } = require('./events/shutdown.js');

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Initialize Firebase Client SDK
const firebaseApp = initializeApp(firebaseConfig);
console.log('Firebase Client SDK initialized');

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${firebaseConfig.projectId}.firebaseio.com`,
	storageBucket: firebaseConfig.storageBucket

});
console.log('Firebase Admin SDK initialized');

// Initialize activeQueues
client.activeQueues = new Collection();

// COMMAND HANDLING
client.commands = new Collection();
client.cooldowns = new Collection();
const commandFoldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(commandFoldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(commandFoldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		// Set a new item in the Collection with the key as the command name and the value as the exported module
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

// EVENT HANDLING
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
	const filePath = path.join(eventsPath, file);
	const event = require(filePath);
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args));
	} else {
		client.on(event.name, (...args) => event.execute(...args));
	}
}

// Log in to Discord with your client's token
client.login(token);

// Handle graceful shutdown
process.on('SIGTERM', async () => {
	console.log('Bot is shutting down, saving data...');
    await saveQueueData(client);
    process.exit(0);
});

process.on('SIGINT', async () => {
	console.log('Bot is shutting down, saving data...');
    await saveQueueData(client);
    process.exit(0);
});

process.on('beforeExit', async () => {
	console.log('Bot is shutting down, saving data...');
    await saveQueueData(client);
    process.exit(0);
});

// Handle uncaught exceptions and rejections
process.on('uncaughtException', async (err) => {
    console.error('Uncaught Exception:', err);
    await saveQueueData(client);
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    await saveQueueData(client);
    process.exit(1);
});