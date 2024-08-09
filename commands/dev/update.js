const { SlashCommandBuilder } = require('discord.js');
const { saveQueueData } = require('../../events/shutdown.js');

module.exports = {
    cooldown: 120,
    data: new SlashCommandBuilder()
        .setName('update')
        .setDescription('Saves the current queue data and restarts the bot for updates.'),
    async execute(interaction) {
        // Acknowledge the command execution
        await interaction.qReply({ 
            content: 'Updating bot... Saving data and restarting.', 
            type: 'info' 
        });

        // Save the queue data
        try {
            console.log('Saving queue data before restart...');
            await saveQueueData(interaction.client);
            console.log('Queue data saved successfully.');
        } catch (error) {
            console.error('Error saving queue data before restart:', error);
            return interaction.qFollowUp({ 
                content: 'Error saving queue data. Restart aborted.', 
                type: 'error'
            });
        }

        // Simulate a process exit for a restart
        console.log('Restarting bot...');
        process.exit(0);
    },
};
