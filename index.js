const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { token, fbApiKey, fbProjectId, fbSenderId, fbAppId } = require('./config/config.json');
const { initializeApp } = require('firebase/app');
var admin = require('firebase-admin');

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Initialize firebase
const firebaseConfig = {
    apiKey: fbApiKey,
    authDomain: `${fbProjectId}.firebaseapp.com`,
    projectId: fbProjectId,
    storageBucket: `${fbProjectId}.appspot.com`,
    messagingSenderId: fbSenderId,
    appId: fbAppId,
};

// Initialize Firebase Client SDK
const firebaseApp = initializeApp(firebaseConfig);
console.log('Firebase Client SDK initialized');

// Firebase Admin SDK Configuration
var serviceAccount = require("./config/firebase-admin.json");

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://(default).firebaseio.com`,
	storageBucket: `${fbProjectId}.appspot.com`

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