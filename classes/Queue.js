const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } = require('discord.js');

// Replace with affected variables later
const readyUpTime = 10; // Time in minutes to ready up
const maxGuests = 1;
const maxTimeoutDuration = 900_000;

class Queue {
    constructor(key, options) {
        // Identifiers
        this.key = key;
        this.response = options.response || null;

        // Creator Attributes
        this.creator = {
            id: options.creator.id,
            name: options.creator.name,
            avatar: options.creator.avatar
        };

        // Permanent Attributes
        this.name = options.name;
        this.start = options.start;
        this.timezone = options.timezone;
        this.thumbnail = options.thumbnail;
        this.mainMax = options.mainMax;
        this.waitlistMax = options.waitlistMax;

        // Queue Containers
        this.main = options.main || new Map();
        this.waitlist = options.waitlist || new Map();
        this.numGuests = options.numGuests || 0;
        this.userTimers = options.userTimers || new Map();
        this.ready = options.ready || false;
        this.ended = options.ended || false;

        // Initialize Embed
        this.embed = new EmbedBuilder()
            .setColor(0x5A6AEF) // Blue
            .setAuthor({ name: `Started by ${this.creator.name}`, iconURL: this.creator.avatar})
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

    async sendResponse(interaction) {
        this.response = await interaction.reply({
            embeds: [this.embed],
            components: [this.buttonsRow],
            fetchReply: true
        }).catch(console.error);

        this.channelId = this.response.channelId;
        this.messageId = this.response.id;

        this.startCollector();
    }

    async startCollector() {
        let collector = null;
        if(!this.ready) {
            collector = this.response.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: (this.start - Math.floor(Date.now() / 1000)) * 1000
            });
        } else {
            collector = this.response.createMessageComponentCollector({
                componentType: ComponentType.Button
            });
        }

        collector.on('collect', async (i) => {
            try {
                if (i.customId === 'join') {
                    // Handle a user trying to join
                    if (this.main.has(i.user.id)) {
                        await i.qReply({ 
                            content: 'You are already in the queue.', 
                            type: 'warning'
                        });
                    }
                    else if (this.waitlist.has(i.user.id)) {
                        await i.qReply({ 
                            content: 'You are already in the waitlist.', 
                            type: 'warning'
                        });
                    }
                    else if (this.main.size + this.numGuests < this.mainMax) {
                        await this.addMain(i.user);
                        await this.updateResponse();
                        await i.qReply({ 
                            content: 'You have been added to the queue.', 
                            type: 'success'
                        });
                    } else if (this.waitlist.size < this.waitlistMax) {
                        await this.addWaitlist(i.user);
                        await this.updateResponse();
                        await i.qReply({ 
                            content: 'You have been added to the waitlist since the queue is full.', 
                            type: 'success'
                        });
                    } else {
                        await i.qReply({ 
                            content: 'Both the queue and the waitlist are full.', 
                            type: 'warning'
                        });
                    }
                } else if (i.customId === 'addGuest') {
                    // Handle a user trying a add a guest
                    if (this.main.has(i.user.id)) {
                        if (this.main.get(i.user.id).guests >= maxGuests) {
                            await i.qReply({ 
                                content: `You have already hit the max of ${maxGuests} guest(s).`, 
                                type: 'warning'
                            });
                        } else if (this.main.size + this.numGuests < this.mainMax) {
                            await this.addGuest(i.user);
                            await this.updateResponse();
                            await i.qReply({ 
                                content: 'Your guest has been added to the queue.', 
                                type: 'success'
                            });
                        } else {
                            await i.qReply({ 
                                content: 'The queue is full. Guests may not be added to the waitlist.', 
                                type: 'warning'
                            });
                        }
                    } else {
                        await i.qReply({ 
                            content: 'You must be in the queue to add a guest.', 
                            type: 'warning'
                        });
                    }
                } else if (i.customId === 'readyUp') {
                    // Handle a user trying to ready up
                    if (this.main.has(i.user.id)) {
                        await this.readyUp(i.user);
                        await this.checkEnd();
                        await this.updateResponse();
                        await i.qReply({ 
                            content: `<@${i.user.id}>, you have successfully readied up!`, 
                            type: 'success'
                        });
                    } else {
                        await i.qReply({ 
                            content: 'You are not in the queue.', 
                            type: 'warning'
                        });
                    }
                } else if (i.customId === 'leave') {
                    // Handle a user trying to leave the queue
                    if (this.main.get(i.user.id)) {
                        if (this.main.get(i.user.id).ready) {
                            await i.qReply({ 
                                content: 'You cannot leave the queue after you have readied up.', 
                                type: 'warning'
                            });
                        } else {
                            await this.removeMain(i.user);
                            await this.fillMain();
                            if(this.ready) await this.checkEnd();
                            await this.updateResponse();
                            await i.qReply({ 
                                content: 'You have been removed from the queue.', 
                                type: 'success'
                            });
                        }
                    } else if (this.waitlist.has(i.user.id)) {
                        await this.removeWaitlist(i.user);
                        if(this.ready) await this.checkEnd();
                        await this.updateResponse();
                        await i.qReply({ 
                            content: 'You have been removed from the waitlist.', 
                            type: 'success'
                        });
                    } else {
                        await i.qReply({ 
                            content: 'You are not in the queue or waitlist.', 
                            type: 'warning'
                        });
                    }
                } else if (i.customId === 'cancel') {
                    // Handle a user trying to cancel the queue
                    if (i.user.id === this.creator.id) {
                        await this.cancel();
                        await collector.stop(); // Stop the collector when the queue is canceled
                        await this.updateResponse();
                        await i.qReply({ 
                            content: `${this.name} for <t:${this.start}:t> has been canceled by ${i.user}`, 
                            type: 'info',
                            ephemeral: false
                        });
                    } else {
                        await i.qReply({ 
                            content: 'Only the queue creator can cancel the queue.', 
                            type: 'warning'
                        });
                    }
                    return;
                }
            } catch (error) {
                console.error('Error handling button interaction:', error);
                await i.qReply({ 
                    content: 'An error occurred while processing your request. Please try again later.', 
                    type: 'error' 
                });
            }
        });

        collector.on('end', async () => {
            console.log(`Collector ended`);
            await this.checkEnd();
            // Start readyUp collector if not ready or ended
            if(!this.ready && !this.ended) {
                console.log(`Ready up collector started`);
                await this.readyQueue();
                // Set timers for original users in the queue
                this.main.forEach(user => {
                    this.setTimer(user.id, readyUpTime * 60_000, true);
                });
                this.startCollector();
            }
            await this.updateResponse();
        });
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
            await this.setTimer(user.id, readyUpTime * 60_000);
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

    async setTimer(userId, timeLeft, initial = false) {
        // Logic to set a timer for user to ready up
        const endTime = Date.now() + timeLeft;
        const endTimestamp = Math.round(endTime / 1_000);
        let timerResponse;
    
        // Fetch the user object by userId and send a DM notifying them to ready up
        const userObj = await this.response.client.users.fetch(userId);
        
        let prevTimer = this.userTimers.get(userId);
        if (prevTimer) {
            // Fetch the old DM message
            console.log('Found previous timer');
            const dmChannel = await userObj.createDM();
            timerResponse = await dmChannel.messages.fetch(prevTimer.timerResponseId).catch(error => {
                console.error(`Failed to fetch previous DM message for user ${userId}:`, error);
                return null;
            });

            if (prevTimer.initial) {
                await timerResponse.qEdit({
                    content: `${this.name} is starting!\n\nQueue Link: ${this.response.url}\n\nYou must ready up <t:${endTimestamp}:R> or you'll be removed from the queue.`,
                    type: 'info',
                    thumbnail: this.thumbnail
                });
            } else {
                await timerResponse.qEdit({
                    content: `You were moved into the queue for ${this.name}!\n\nQueue Link: ${this.response.url}\n\nYou must ready up <t:${endTimestamp}:R> or you'll be removed from the queue.`,
                    type: 'info',
                    thumbnail: this.thumbnail
                });
            }
        } else {
            if (initial) {
                timerResponse = await userObj.qSend({
                    content: `${this.name} is starting!\n\nQueue Link: ${this.response.url}\n\nYou must ready up <t:${endTimestamp}:R> or you'll be removed from the queue.`,
                    type: 'info',
                    thumbnail: this.thumbnail
                });
            } else {
                timerResponse = await userObj.qSend({
                    content: `You were moved into the queue for ${this.name}!\n\nQueue Link: ${this.response.url}\n\nYou must ready up <t:${endTimestamp}:R> or you'll be removed from the queue.`,
                    type: 'info',
                    thumbnail: this.thumbnail
                });
            }
        }

        this.userTimers.set(userId, { endTime: endTime, timerResponseId: timerResponse.id, initial: initial });
    
        setTimeout(async () => {
            if (this.userTimers.get(userId) === endTime) {
                await this.removeMain(await this.response.client.users.fetch(userId));
                await this.fillMain();
                await this.checkEnd();
                await this.updateResponse();
    
                // Update the DM to the user notifying them they have been removed from the queue
                await timerResponse.qEdit({
                    content: `You did not ready up in time for ${this.name}!\n\nQueue Link: ${this.response.url}\n\nYou were removed from the queue <t:${endTimestamp}:R>.`,
                    type: 'warning'
                });
    
                // Remove the user from userTimers
                this.userTimers.delete(userId);
            }
        }, timeLeft)
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
        try {
            const userObj = await this.response.client.users.fetch(user.id);
            let prevTimer = this.userTimers.get(user.id);
            const dmChannel = await userObj.createDM();
            let timerResponse = await dmChannel.messages.fetch(prevTimer.timerResponseId).catch(error => {
                console.error(`Failed to fetch previous DM message for user ${user.id}:`, error);
                return null;
            });

            const readyTimestamp = Math.round(Date.now() / 1_000);
            await timerResponse.qEdit({
                content: `Successfully readied up for ${this.name}!\n\nQueue Link: ${this.response.url}\n\nYou readied up <t:${readyTimestamp}:R>.`,
                type: 'success'
            });

            // Remove the timer since the user is now readied up
            this.userTimers.delete(user.id);

        } catch (error) {
            console.error(`Failed to update DM for user ${user.id} after readying up:`, error);
        }
        this.main.get(user.id).ready = true;

        await this.updateEmbed();
    }

    async readyQueue() {
        this.ready = true;
        const options = {
            color: 0x297F48, // Green
            title: `${this.name} - Readying Up`,
            description: `Started at <t:${this.start}:t>`,
        };

        await this.updateEmbed(options);
        await this.updateButtons({ buttons: [this.readyUpButton, this.leaveButton, this.cancelButton] });
    }

    async close() {
        // Logic to close the queue
        this.ready = false;
        this.ended = true;
        this.userTimers.clear();
        const options = {
            color: 0x7D50A0, // Purple
            title: `${this.name} - Closed`,
            description: `Closed at <t:${this.start}:t>`,
        };

        await this.updateEmbed(options);
        await this.updateButtons({ disable: true });
        await this.response.client.activeQueues.delete(this.key);
    }

    async cancel() {
        // Logic to cancel the queue
        this.ready = false;
        this.ended = true;
        this.userTimers.clear();
        const options = {
            color: 0xD83941, // Red
            title: `${this.name} - Cancelled`,
            description: `Was set for <t:${this.start}:t>`,
        };

        await this.updateEmbed(options);
        await this.updateButtons({ disable: true });
        await this.response.client.activeQueues.delete(this.key);
    }
}

module.exports = Queue;