const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	cooldown: 2,
	data: new SlashCommandBuilder()
		.setName('cancelqueue')
		.setDescription('Cancels a queue'),
	async execute(interaction) {
		await interaction.reply('Cancelled queue');
	},
};