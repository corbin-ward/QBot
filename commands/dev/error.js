const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('error')
        .setDescription('Causes an uncaught exception for testing purposes'),
    async execute(interaction) {
        // Intentionally cause an uncaught exception
        throw new Error('This is an intentional uncaught exception.');
    },
};
