const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } = require('discord.js');

const readyUpTime = 10; // Time in minutes to ready up
const maxGuests = 1;
const maxTimeoutDuration = 900_000;

class Queue {
    constructor(key, options) {
        this.key = key;
        this.response = options.response || null;

        this.creator = {
            id: options.creator.id,
            name: options.creator.name,
            avatar: options.creator.avatar
        };

        this.name = options.name;
        this.start = options.start;
        this.timezone = options.timezone;
        this.thumbnail = options.thumbnail;
        this.mainMax = options.mainMax;
        this.waitlistMax = options.waitlistMax;

        this.main = options.main || new Map();
        this.waitlist = options.waitlist || new Map();
        this.numGuests = options.numGuests || 0;
        this.userTimers = options.userTimers || new Map();
        this.ready = options.ready || false;
        this.ended = options.ended || false;

        this.interactionQueue = []; // Queue to store interactions
        this.isProcessing = false; // Flag to check if processing is ongoing

        this.embed = new EmbedBuilder()
            .setColor(0x5A6AEF)
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
        
        this.joinButton = new ButtonBuilder()
            .setCustomId('join')
            .setLabel('Join')
            .setStyle(ButtonStyle.Primary);

        this.addGuestButton = new ButtonBuilder()
            .setCustomId('addGuest')
            .setLabel('Add Guest')
            .setStyle(ButtonStyle.Secondary);

        this.readyUpButton = new ButtonBuilder()
            .setCustomId('readyUp')
            .setLabel('Ready Up')
            .setStyle(ButtonStyle.Success);

        this.leaveButton = new ButtonBuilder()
            .setCustomId('leave')
            .setLabel('Leave')
            .setStyle(ButtonStyle.Secondary);

        this.cancelButton = new ButtonBuilder()
            .setCustomId('cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger);
        
        this.buttons = [this.joinButton, this.addGuestButton, this.leaveButton, this.cancelButton];
        this.buttonsRow = new ActionRowBuilder().addComponents(this.buttons);
    }

    async sendResponse(interaction) {
        try {
            this.response = await interaction.reply({
                embeds: [this.embed],
                components: [this.buttonsRow],
                fetchReply: true
            });
            this.channelId = this.response.channelId;
            this.messageId = this.response.id;
            this.startCollector();
        } catch (error) {
            console.error('Error sending response:', error);
        }
    }

    async startCollector() {
        try {
            let collector;
            if (!this.ready) {
                collector = this.response.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: (this.start - Math.floor(Date.now() / 1000)) * 1000
                });
            } else {
                collector = this.response.createMessageComponentCollector({
                    componentType: ComponentType.Button
                });
            }

            collector.on('collect', (i) => {
                this.interactionQueue.push(i); // Add interaction to the queue
                this.processNextInteraction(); // Start processing the queue
            });

            collector.on('end', async () => {
                console.log('Collector ended');
                try {
                    await this.checkEnd();
                    if (!this.ready && !this.ended) {
                        console.log('Ready up collector started');
                        await this.readyQueue();
                        this.main.forEach(user => {
                            this.setTimer(user.id, readyUpTime * 60_000, true);
                        });
                        this.startCollector();
                    }
                    await this.updateResponse();
                } catch (error) {
                    console.error('Error handling collector end:', error);
                }
            });
        } catch (error) {
            console.error('Error starting collector:', error);
        }
    }
    
    async processNextInteraction() {
        if (this.isProcessing || this.interactionQueue.length === 0) {
            return; // If already processing or no interactions in queue, do nothing
        }

        this.isProcessing = true; // Set processing flag to true
        const interaction = this.interactionQueue.shift(); // Get the next interaction from the queue

        try {
            switch (interaction.customId) {
                case 'join':
                    await this.handleJoin(interaction);
                    break;
                case 'addGuest':
                    await this.handleAddGuest(interaction);
                    break;
                case 'readyUp':
                    await this.handleReadyUp(interaction);
                    break;
                case 'leave':
                    await this.handleLeave(interaction);
                    break;
                case 'cancel':
                    await this.handleCancel(interaction);
                    break;
                default:
                    console.warn(`Unknown interaction customId: ${interaction.customId}`);
                    break;
            }
        } catch (error) {
            console.error('Error handling button interaction:', error);
        } finally {
            this.isProcessing = false; // Release processing flag
            this.processNextInteraction(); // Process the next interaction in the queue
        }
    }

    async handleJoin(interaction) {
        if (this.main.has(interaction.user.id)) {
            await interaction.qReply({
                content: 'You are already in the queue.',
                type: 'warning'
            });
        } else if (this.waitlist.has(interaction.user.id)) {
            await interaction.qReply({
                content: 'You are already in the waitlist.',
                type: 'warning'
            });
        } else if (this.main.size + this.numGuests < this.mainMax) {
            await this.addMain(interaction.user);
            await this.updateResponse();
            await interaction.qReply({
                content: 'You have been added to the queue.',
                type: 'success'
            });
        } else if (this.waitlist.size < this.waitlistMax) {
            await this.addWaitlist(interaction.user);
            await this.updateResponse();
            await interaction.qReply({
                content: 'You have been added to the waitlist since the queue is full.',
                type: 'success'
            });
        } else {
            await interaction.qReply({
                content: 'Both the queue and the waitlist are full.',
                type: 'warning'
            });
        }
    }

    async handleAddGuest(interaction) {
        if (this.main.has(interaction.user.id)) {
            if (this.main.get(interaction.user.id).guests >= maxGuests) {
                await interaction.qReply({
                    content: `You have already hit the max of ${maxGuests} guest(s).`,
                    type: 'warning'
                });
            } else if (this.main.size + this.numGuests < this.mainMax) {
                await this.addGuest(interaction.user);
                await this.updateResponse();
                await interaction.qReply({
                    content: 'Your guest has been added to the queue.',
                    type: 'success'
                });
            } else {
                await interaction.qReply({
                    content: 'The queue is full. Guests may not be added to the waitlist.',
                    type: 'warning'
                });
            }
        } else {
            await interaction.qReply({
                content: 'You must be in the queue to add a guest.',
                type: 'warning'
            });
        }
    }

    async handleReadyUp(interaction) {
        if (this.main.has(interaction.user.id)) {
            await this.readyUp(interaction.user);
            await this.checkEnd();
            await this.updateResponse();
            await interaction.qReply({
                content: `<@${interaction.user.id}>, you have successfully readied up!`,
                type: 'success'
            });
        } else {
            await interaction.qReply({
                content: 'You are not in the queue.',
                type: 'warning'
            });
        }
    }

    async handleLeave(interaction) {
        if (this.main.get(interaction.user.id)) {
            if (this.main.get(interaction.user.id).ready) {
                await interaction.qReply({
                    content: 'You cannot leave the queue after you have readied up.',
                    type: 'warning'
                });
            } else {
                await this.removeMain(interaction.user);
                await this.fillMain();
                if(this.ready) await this.checkEnd();
                await this.updateResponse();
                await interaction.qReply({
                    content: 'You have been removed from the queue.',
                    type: 'success'
                });
            }
        } else if (this.waitlist.has(interaction.user.id)) {
            await this.removeWaitlist(interaction.user);
            if(this.ready) await this.checkEnd();
            await this.updateResponse();
            await interaction.qReply({
                content: 'You have been removed from the waitlist.',
                type: 'success'
            });
        } else {
            await interaction.qReply({
                content: 'You are not in the queue or waitlist.',
                type: 'warning'
            });
        }
    }

    async handleCancel(interaction) {
        if (interaction.user.id === this.creator.id) {
            await this.cancel();
            await this.updateResponse();
            await interaction.qReply({
                content: `${this.name} for <t:${this.start}:t> has been canceled by ${interaction.user}`,
                type: 'info',
                ephemeral: false
            });
        } else {
            await interaction.qReply({
                content: 'Only the queue creator can cancel the queue.',
                type: 'warning'
            });
        }
    }

    async updateResponse() {
        try {
            await this.response.edit({
                embeds: [this.embed],
                components: [this.buttonsRow],
                fetchReply: true
            });
        } catch (error) {
            console.error('Error updating response:', error);
        }
    }

    async updateEmbed(options = {}) {
        if (options.color) this.embed.setColor(options.color);
        if (options.title) this.embed.setTitle(options.title);
        if (options.description) this.embed.setDescription(options.description);

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
    }

    async updateButtons(options = {}) {
        if (options.buttons) this.buttons = options.buttons;
        if (options.disable) this.buttons = this.buttons.map(button => button.setDisabled());
        this.buttonsRow = new ActionRowBuilder().addComponents(this.buttons);
    }

    async fillMain() {
        try {
            while (this.main.size + this.numGuests < this.mainMax && this.waitlist.size > 0) {
                const [userId, user] = this.waitlist.entries().next().value;
                this.waitlist.delete(userId);
                this.main.set(userId, user);
                await this.setTimer(user.id, readyUpTime * 60_000);
            }
            await this.updateEmbed();
        } catch (error) {
            console.error('Error filling main queue:', error);
        }
    }

    async checkEnd() {
        try {
            if (this.main.size + this.numGuests === 0 && this.waitlist.size === 0) {
                await this.cancel();
            }
            else if (Array.from(this.main.values()).every(user => user.ready)) {
                if (this.main.size + this.numGuests >= this.mainMax || this.waitlist.size === 0) {
                    await this.close();
                }
            }
        } catch (error) {
            console.error('Error checking end conditions:', error);
        }
    }

    async setTimer(userId, timeLeft, initial = false) {
        try {
            const endTime = Date.now() + timeLeft;
            const endTimestamp = Math.round(endTime / 1_000);
            let timerResponse;

            const userObj = await this.response.client.users.fetch(userId);

            let prevTimer = this.userTimers.get(userId);
            if (prevTimer) {
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
                try {
                    if (this.userTimers.get(userId) === endTime) {
                        await this.removeMain(await this.response.client.users.fetch(userId));
                        await this.fillMain();
                        await this.checkEnd();
                        await this.updateResponse();

                        await timerResponse.qEdit({
                            content: `You did not ready up in time for ${this.name}!\n\nQueue Link: ${this.response.url}\n\nYou were removed from the queue <t:${endTimestamp}:R>.`,
                            type: 'warning'
                        });

                        this.userTimers.delete(userId);
                    }
                } catch (error) {
                    console.error(`Error handling timer timeout for user ${userId}:`, error);
                }
            }, timeLeft);
        } catch (error) {
            console.error(`Error setting timer for user ${userId}:`, error);
        }
    }

    async addMain(user) {
        try {
            this.main.set(user.id, { 
                id: user.id, 
                username: user.username, 
                guests: 0, 
                ready: false 
            });
            await this.updateEmbed();
        } catch (error) {
            console.error('Error adding user to main queue:', error);
        }
    }

    async addWaitlist(user) {
        try {
            this.waitlist.set(user.id, { 
                id: user.id, 
                username: user.username, 
                guests: 0, 
                ready: false 
            });
            await this.updateEmbed();
        } catch (error) {
            console.error('Error adding user to waitlist:', error);
        }
    }

    async addGuest(user) {
        try {
            this.main.get(user.id).guests++;
            this.numGuests++;
            await this.updateEmbed();
        } catch (error) {
            console.error('Error adding guest:', error);
        }
    }

    async removeMain(user) {
        try {
            this.numGuests -= this.main.get(user.id).guests;
            this.userTimers.delete(user.id);
            this.main.delete(user.id);
            await this.updateEmbed();
        } catch (error) {
            console.error('Error removing user from main queue:', error);
        }
    }

    async removeWaitlist(user) {
        try {
            this.waitlist.delete(user.id);
            await this.updateEmbed();
        } catch (error) {
            console.error('Error removing user from waitlist:', error);
        }
    }

    async readyUp(user) {
        try {
            console.log('User Timers:', this.userTimers);
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
            color: 0x297F48,
            title: `${this.name} - Readying Up`,
            description: `Started at <t:${this.start}:t>`,
        };

        await this.updateEmbed(options);
        await this.updateButtons({ buttons: [this.readyUpButton, this.leaveButton, this.cancelButton] });
    }

    async close() {
        try {
            this.ready = false;
            this.ended = true;
            this.userTimers.clear();
            const options = {
                color: 0x7D50A0,
                title: `${this.name} - Closed`,
                description: `Closed at <t:${this.start}:t>`,
            };
            await this.updateEmbed(options);
            await this.updateButtons({ disable: true });
            await this.response.client.activeQueues.delete(this.key);
        } catch (error) {
            console.error('Error closing queue:', error);
        }
    }

    async cancel() {
        try {
            this.ready = false;
            this.ended = true;
            this.userTimers.clear();
            const options = {
                color: 0xD83941,
                title: `${this.name} - Cancelled`,
                description: `Was set for <t:${this.start}:t>`,
            };
            await this.updateEmbed(options);
            await this.updateButtons({ disable: true });
            await this.response.client.activeQueues.delete(this.key);
        } catch (error) {
            console.error('Error canceling queue:', error);
        }
    }
}

module.exports = Queue;
