const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        client.user.setActivity({
            name: "Ready to queue up?"
        });

        console.log(`Ready! Logged in as ${client.user.tag}`);
    },
};