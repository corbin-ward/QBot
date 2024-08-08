const { Events } = require('discord.js');
const { loadQueueData } = require('./startup.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        client.user.setActivity({
            name: "Ready to queue up?"
        });

        console.log(`Logged in as ${client.user.tag}`);

        // Load data after the bot is ready
        try {
            await loadQueueData(client);
            client.loadedData = true;
            console.log('Queue data loaded successfully.');
        } catch (error) {
            console.error('Error loading queue data:', error);
        }
    },
};