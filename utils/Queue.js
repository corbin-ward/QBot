const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const moment = require('moment-timezone');
const admin = require('firebase-admin');

// Replace with affected variables later
const readyUpTime = 1; // Time in minutes to ready up

class Queue {
    constructor(key, interaction, options) {
        // Identifiers
        this.key = key;
        this.interaction = interaction;
        this.response = null;

        // Permanent Attributes
        this.name = options.name || 'Unknown Queue';
        // TODO: Fix fallback start time
        this.start = options.start || Date.now() + 3_600_000;
        this.thumbnail = options.thumbnail || 'https://i.imgur.com/j1LmKzM.png' ;
        this.mainMax = options.mainMax || 1;
        this.waitlistMax = options.waitlistMax || 0;

        // Queue Containers
        this.main = new Map();
        this.waitlist = new Map();
        this.numGuests = 0;
        this.userTimers = new Map();

        // Initialize Embed
        this.embed = new EmbedBuilder()
            .setColor(0x5A6AEF) // Blue
            .setAuthor({ name: `Started by ${this.interaction.user.username}`, iconURL: interaction.user.displayAvatarURL()})
            .setTitle(this.name)
            .setDescription(`Queue will start at: <t:${this.start}:t>`)
            .setThumbnail(this.thumbnail)
            .addFields(
                { name: 'Main Queue', value: `${this.mainMax}/${this.mainMax} Spots Left\n\n\n\u200B`, inline: true },
                { name: 'Waitlist', value: `${this.waitlistMax}/${this.waitlistMax} Spots Left\n\n\n\u200B`, inline: true }
            )
            .setFooter({ text: 'Created using QBot', iconURL: 'https://i.imgur.com/j1LmKzM.png' })
            .setTimestamp();
        
        // Initialize buttons
        this.joinButton = new ButtonBuilder()
            .setCustomId('join')
            .setLabel('Join')
            .setStyle(ButtonStyle.Primary);

        this.addGuestButton = new ButtonBuilder()
            .setCustomId('addGuest')
            .setLabel('Add Guest')
            .setStyle(ButtonStyle.Secondary)

        this.readyUpButton = new ButtonBuilder()
            .setCustomId('readyUp')
            .setLabel('Ready Up')
            .setStyle(ButtonStyle.Success)

        this.leaveButton = new ButtonBuilder()
            .setCustomId('leave')
            .setLabel('Leave')
            .setStyle(ButtonStyle.Secondary);

        this.cancelButton = new ButtonBuilder()
            .setCustomId('cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger);
        
        this.buttons = [this.joinButton, this.addGuestButton, this.leaveButton, this.cancelButton];

        // Buttons are grouped in an ActionRow
        this.buttonsRow = new ActionRowBuilder().addComponents(this.buttons);
    }

    async sendResponse() {
        this.response = await this.interaction.reply({
            embeds: [this.embed],
            components: [this.buttonsRow],
            fetchReply: true
        }).catch(console.error);
    }

    async updateResponse() {
        await this.response.edit({
            embeds: [this.embed],
            components: [this.buttonsRow],
            fetchReply: true
        }).catch(console.error);
    }

    async updateEmbed(options = {}) {
        // Logic to update the embed based on options

        if(options.color) this.embed.setColor(options.color);
        if(options.title) this.embed.setTitle(options.title);
        if(options.description) this.embed.setDescription(options.description);

        const mainUsers = Array.from(this.main.values())
            .flatMap(user => {
                const names = [];
                const checkmark = user.ready ? '✅' : '';
                names.push(`${user.username} ${checkmark}`);
                for (let i = 1; i <= user.guests; i++) {
                    names.push(`${user.username}'s guest ${checkmark}`);
                }
                return names;
            })
            .join('\n');

        const waitlistUsers = Array.from(this.waitlist.values())
            .flatMap(user => {
                const names = [];
                const checkmark = user.ready ? '✅' : '';
                names.push(`${user.username} ${checkmark}`);
                return names;
            })
            .join('\n');

        this.embed.setFields(
            { name: 'Main Queue', value: `${this.mainMax - this.main.size - this.numGuests}/${this.mainMax} Spots Left\n\n${mainUsers}\n\u200B`, inline: true },
            { name: 'Waitlist', value: `${this.waitlistMax - this.waitlist.size}/${this.waitlistMax} Spots Left\n\n${waitlistUsers}\n\u200B`, inline: true }
        );
        
        // Edit at the end of functions instead
        // await this.response.edit({ embeds: [this.embed], components: [this.buttons] });
    }

    async updateButtons(options = {}) {
        // Logic to update the buttons
        if(options.buttons) this.buttons = options.buttons;
        if(options.disable) this.buttons = this.buttons.map(button => button.setDisabled());

        // Create a new ActionRow with the updated buttons
        this.buttonsRow = new ActionRowBuilder().addComponents(this.buttons);
    }

    async fillMain() {
        // Logic to move users from waitlist to fill main queue
        while (this.main.size + this.numGuests < this.mainMax && this.waitlist.size > 0) {
            const [userId, user] = this.waitlist.entries().next().value;
            this.waitlist.delete(userId);
            this.main.set(userId, user);
            setTimer(user);
        }

        this.updateEmbed();
    }

    async checkEnd() {
        // Logic to check if the queue should be closed or updated
        if (this.main.size + this.numGuests == 0 && this.waitlist.size === 0) {
            // Queue and waitlist are empty
            this.cancel();
        }
        else if (Array.from(this.main.values()).every(user => user.ready)) {
            if (this.main.size + this.numGuests >= this.mainMax) {
                // Queue is full and all users are ready
                this.close();
            } else if (this.waitlist.size === 0) {
                // Waitlist is empty and all users are ready
                this.close();
            }
        }
        
    }

    async setTimer(user) {
        // Logic to set a timer for user to ready up
        const endTime = Date.now() + readyUpTime * 60 * 1_000;
            const endTimestamp = Math.round(endTime / 1_000);
            this.userTimers.set(user.id, endTime);

            // Send a DM to the user notifying them to ready up
            this.interaction.client.users.fetch(user.id).then(userObj => {
                userObj.send(`${this.name} in ${this.interaction.guild.name} is starting!\n\nQueue Link: ${this.response.url}\n\nYou must ready up <t:${endTimestamp}:R> or you'll be removed from the queue.`);
            });

            setTimeout(async () => {
                if (this.userTimers.get(user.id) === endTime) {
                    this.removeMain(user);
                    this.fillMain();
                    this.checkEnd();
                    await this.updateResponse();

                    // Send a DM to the user notifying them they have been removed from the queue
                    this.interaction.client.users.fetch(user.id).then(userObj => {
                        userObj.send(`You did not ready up in time and have been removed from the queue for ${this.name} in ${this.interaction.guild.name}.`);
                    });
                }
            }, readyUpTime * 60 * 1_000);
    }

    async addMain(user) {
        // Logic to add user to main queue
        this.main.set(user.id, { 
            id: user.id, 
            username: user.username, 
            guests: 0, 
            ready: false 
        });

        this.updateEmbed();
    }

    async addWaitlist(user) {
        // Logic to add user to waitlist
        this.waitlist.set(user.id, { 
            id: user.id, 
            username: user.username, 
            guests: 0, 
            ready: false 
        });

        this.updateEmbed();
    }

    async addGuest(user) {
        // Logic to add a guest for a user
        this.main.get(user.id).guests++;
        this.numGuests++;

        this.updateEmbed();
    }

    async removeMain(user) {
        // Logic for user to be removed from the queue
        this.numGuests = this.numGuests - this.main.get(user.id).guests;
        this.userTimers.delete(user.id);
        this.main.delete(user.id);

        this.updateEmbed();
    }

    async removeWaitlist(user) {
        // Logic for user to be removed from the waitlist
        this.waitlist.delete(user.id);

        this.updateEmbed();
    }

    async readyUp(user) {
        // Logic for user to be readied up
        this.main.get(user.id).ready = true;
        this.userTimers.delete(user.id);

        this.updateEmbed();
    }

    async ready() {
        const options = {
            color: 0x297F48,
            title: `${this.name} - Readying Up`,
            description: `Started at <t:${this.start}:t>`,
        };

        this.updateEmbed(options);
        this.updateButtons({ buttons: [this.readyUpButton, this.leaveButton, this.cancelButton] });
    }

    async close() {
        // Logic to close the queue
        this.userTimers.clear();
        const options = {
            color: 0x7D50A0,
            title: `${this.name} - Closed`,
            description: `Closed at <t:${this.start}:t>`,
        };

        this.updateEmbed(options);
        this.updateButtons({ disable: true });
        this.interaction.client.activeQueues.delete(this.key);
    }

    async cancel() {
        // Logic to cancel the queue
        this.userTimers.clear();
        const options = {
            color: 0xD83941,
            title: `${this.name} - Cancelled`,
            description: `Was set for <t:${this.start}:t>`,
        };

        this.updateEmbed(options);
        this.updateButtons({ disable: true });
        this.interaction.client.activeQueues.delete(this.key);
    }
}

module.exports = Queue;