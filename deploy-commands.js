const { REST, Routes } = require('discord.js');
const { clientId, devGuildId, token } = require('./config/discord.js.json');
const fs = require('node:fs');
const path = require('node:path');
const { initializeApp } = require('firebase/app');
const admin = require('firebase-admin');
const firebaseConfig = require('./config/firebase.json');
const serviceAccount = require("./config/firebase-admin.json");

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

const globalCommands = [];
const devCommands = [];

// Grab all the command folders from the commands directory you created earlier
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	// Grab all the command files from the commands directory you created earlier
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			if (folder === 'dev') {
				// Push to devCommands if in the dev folder
				devCommands.push(command.data.toJSON());
			} else {
				// Push to globalCommands otherwise
				globalCommands.push(command.data.toJSON());
			}
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

// and deploy your commands!
(async () => {
	try {
		// Deploy global commands
		if (globalCommands.length > 0) {
			console.log(`Started refreshing ${globalCommands.length} global application (/) commands.`);
			const data = await rest.put(
				Routes.applicationCommands(clientId),
				{ body: globalCommands },
			);
			console.log(`Successfully reloaded ${data.length} global application (/) commands.`);
		}

		// Deploy dev commands to the specified guild
		if (devCommands.length > 0) {
			console.log(`Started refreshing ${devCommands.length} dev application (/) commands for guild ${devGuildId}.`);
			const data = await rest.put(
				Routes.applicationGuildCommands(clientId, devGuildId),
				{ body: devCommands },
			);
			console.log(`Successfully reloaded ${data.length} dev application (/) commands for guild ${devGuildId}.`);
		}
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
})();