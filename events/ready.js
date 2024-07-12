const { Events } = require('discord.js');
const mongoose = require('mongoose');
const { mongoURI } = require('../config.json');

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		client.user.setActivity({
			name: "Ready to queue up?"
		});

		await mongoose.connect(mongoURI, {
		});

		if(mongoose.connect) {
			console.log('Connected to database');
		} else {
			console.log('Failed to connect to database');
		}

		console.log(`Ready! Logged in as ${client.user.tag}`);
	},
};