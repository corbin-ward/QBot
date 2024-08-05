const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

// Replace with affected variables later
const readyUpTime = 1; // Time in minutes to ready up

class Queue {
    constructor(key, interaction, options) {
        // Identifiers
        this.key = key;
        this.interaction = interaction;
        this.response = null;

        // Permanent Attributes
        this.name = options.name;
        this.start = options.start;
        this.thumbnail = options.thumbnail;
        this.mainMax = options.mainMax;
        this.waitlistMax = options.waitlistMax;

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
            await this.setTimer(user);
        }

        await this.updateEmbed();
    }

    async checkEnd() {
        // Logic to check if the queue should be closed or updated
        if (this.main.size + this.numGuests == 0 && this.waitlist.size === 0) {
            // Queue and waitlist are empty
            await this.cancel();
        }
        else if (Array.from(this.main.values()).every(user => user.ready)) {
            if (this.main.size + this.numGuests >= this.mainMax) {
                // Queue is full and all users are ready
                await this.close();
            } else if (this.waitlist.size === 0) {
                // Waitlist is empty and all users are ready
                await this.close();
            }
        }
        
    }

    async setTimer(user, initial = false) {
        // Logic to set a timer for user to ready up
        const endTime = Date.now() + readyUpTime * 60 * 1_000;
            const endTimestamp = Math.round(endTime / 1_000);
            this.userTimers.set(user.id, endTime);
            let timerResponse;

            // Send a DM to the user notifying them to ready up
            await this.interaction.client.users.fetch(user.id).then(async userObj => {
                if(initial) {
                    timerResponse = await userObj.qSend({
                        content: `${this.name} in ${this.interaction.guild.name} is starting!\n\nQueue Link: ${this.response.url}\n\nYou must ready up <t:${endTimestamp}:R> or you'll be removed from the queue.`,
                        type: 'info',
                        thumbnail: this.thumbnail
                    });
                }
                else {
                    timerResponse = await userObj.qSend({
                        content: `You were moved into the queue for ${this.name} in ${this.interaction.guild.name}!\n\nQueue Link: ${this.response.url}\n\nYou must ready up <t:${endTimestamp}:R> or you'll be removed from the queue.`,
                        type: 'info',
                        thumbnail: this.thumbnail
                    });
                }
            });

            setTimeout(async () => {
                if (this.userTimers.get(user.id) === endTime) {
                    await this.removeMain(user);
                    await this.fillMain();
                    await this.checkEnd();
                    await this.updateResponse();

                    // Update the DM to the user notifying them they have been removed from the queue
                    await timerResponse.qEdit({
                        content: `You did not ready up in time for ${this.name} in ${this.interaction.guild.name}\n\nQueue Link: ${this.response.url}\n\nYou were removed from the queue <t:${endTimestamp}:R>.`,
                        type: 'warning'
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

        await this.updateEmbed();
    }

    async addWaitlist(user) {
        // Logic to add user to waitlist
        this.waitlist.set(user.id, { 
            id: user.id, 
            username: user.username, 
            guests: 0, 
            ready: false 
        });

        await this.updateEmbed();
    }

    async addGuest(user) {
        // Logic to add a guest for a user
        this.main.get(user.id).guests++;
        this.numGuests++;

        await this.updateEmbed();
    }

    async removeMain(user) {
        // Logic for user to be removed from the queue
        this.numGuests = this.numGuests - this.main.get(user.id).guests;
        this.userTimers.delete(user.id);
        this.main.delete(user.id);

        await this.updateEmbed();
    }

    async removeWaitlist(user) {
        // Logic for user to be removed from the waitlist
        this.waitlist.delete(user.id);

        await this.updateEmbed();
    }

    async readyUp(user) {
        // Logic for user to be readied up
        this.main.get(user.id).ready = true;
        this.userTimers.delete(user.id);

        await this.updateEmbed();
    }

    async ready() {
        const options = {
            color: 0x297F48, // Gren
            title: `${this.name} - Readying Up`,
            description: `Started at <t:${this.start}:t>`,
        };

        await this.updateEmbed(options);
        await this.updateButtons({ buttons: [this.readyUpButton, this.leaveButton, this.cancelButton] });
    }

    async close() {
        // Logic to close the queue
        this.userTimers.clear();
        const options = {
            color: 0x7D50A0, // Purple
            title: `${this.name} - Closed`,
            description: `Closed at <t:${this.start}:t>`,
        };

        await this.updateEmbed(options);
        await this.updateButtons({ disable: true });
        await this.interaction.client.activeQueues.delete(this.key);
    }

    async cancel() {
        // Logic to cancel the queue
        this.userTimers.clear();
        const options = {
            color: 0xD83941, // Red
            title: `${this.name} - Cancelled`,
            description: `Was set for <t:${this.start}:t>`,
        };

        await this.updateEmbed(options);
        await this.updateButtons({ disable: true });
        await this.interaction.client.activeQueues.delete(this.key);
    }
}

module.exports = Queue;