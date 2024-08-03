const { SlashCommandBuilder, ComponentType } = require('discord.js');
const { timezones } = require('../../utils/timezones');
const moment = require('moment-timezone');
const admin = require('firebase-admin');
const Queue = require('../../utils/Queue.js');

const maxGuests = 1;

// Function to parse the provided time input into a valid time object in the specified timezone
function parseTime(input, timezone) {
    const formats = [
        'h:mm A', // 12-hour with AM/PM
        'h:mmA',  // 12-hour with AM/PM without space
        'h A',    // 12-hour with AM/PM, hour only
        'hA',     // 12-hour with AM/PM, hour only without space
        'H',      // 24-hour, hour only
        'H:mm'    // 24-hour
    ];
    const now = moment.tz(timezone);
    let parsedTime = moment.tz(input, formats, true, timezone);

    if (!parsedTime.isValid()) {
        console.error("Failed to parse time:", input);
        return null;
    }

    // Ensure the parsed time is in the future, adjust only once
    if (parsedTime.isBefore(now)) {
        parsedTime.add(1, 'day');
    }

    return parsedTime.unix(); // Return Unix timestamp
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Allows you to create queues')
        .addSubcommand(subcommand =>
            subcommand
                .setName('new')
                .setDescription('Utilize a precreated template')
                .addStringOption(option => 
                    option.setName('template-id')
                    .setDescription('Select template')
                    .setRequired(true)
                    .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option.setName('time')
                    .setDescription('Time to ready up e.g. "11:30 PM"')
                    .setRequired(true)
                )
                .addStringOption(option => 
                    option.setName('timezone')
                    .setDescription('Your timezone (Will not be publicly displayed)')
                    .setRequired(true)
                    .addChoices(...timezones)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('manual')
                .setDescription('Manually input queue and waitlist spots')
                .addStringOption(option =>
                    option.setName('name')
                    .setDescription('Name of the queue (Game name)')
                    .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('queue-spots')
                    .setDescription('Number of spots in the queue')
                    .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('waitlist-spots')
                    .setDescription('Number of spots in the waitlist')
                    .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('time')
                    .setDescription('Time to ready up e.g. "11:30 PM"')
                    .setRequired(true)
                )
                .addStringOption(option => 
                    option.setName('timezone')
                    .setDescription('Your timezone (Will not be publicly displayed)')
                    .setRequired(true)
                    .addChoices(...timezones)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('kick')
                .setDescription('Kick a user from the queue or waitlist')
                .addUserOption(option =>
                    option.setName('user')
                    .setDescription('The tag of the user to kick (e.g. "@user")')
                    .setRequired(true)
                )
        ),
    async autocomplete(interaction) {
        // handle the autocompletion response
        const subcommand = interaction.options.getSubcommand();
        const focusedOption = interaction.options.getFocused();
        const db = admin.firestore();

        switch (subcommand) {
            case 'new': {
                try {
                    const serverId = interaction.guild.id;
                    const templatesRef = db.collection('templates');
                    const serverTemplatesRef = db.collection('serverTemplates').where('serverId', '==', serverId);
                    const [templatesSnapshot, serverTemplatesSnapshot] = await Promise.all([
                        templatesRef.get(),
                        serverTemplatesRef.get()
                    ]);
            
                    const choices = templatesSnapshot.docs.map(doc => {
                        const template = doc.data();
                        // Conditionally format the name based on loaded status
                        return {
                            name: `${template.name} by ${template.creatorUsername}`,
                            value: doc.id,
                        };
                    });
            
                    // Filter by the input and respond with both loaded and not loaded templates
                    const filtered = choices.filter(choice =>
                        choice.name.toLowerCase().includes(focusedOption.toLowerCase()) ||
                        choice.name.toLowerCase().includes(focusedOption.toLowerCase())
                    );
            
                    await interaction.respond(filtered);
                } catch (error) {
                    console.error('Error fetching templates for load autocomplete:', error);
                    await interaction.respond(['Error fetching templates']);
                }
                break;
            }
            default: {
                await interaction.respond([]);
                break;
            }
        }
    },
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const db = admin.firestore();
        
        // Define a composite key for active queues using user ID and server ID
        const queueKey = `${interaction.user.id}-${interaction.guild.id}`;

        switch (subcommand) {
            case 'new':
            case 'manual': {
                try {
                    // Check if the user already has an active queue in this server
                    if (interaction.client.activeQueues.has(queueKey)) {
                        return interaction.reply({ content: 'You already have an active queue in this server. You can create a new one after your current queue starts or is canceled.', ephemeral: true });
                    }

                    const queueCreator = interaction.user.id;

                    // Get Start Time
                    const timeInput = interaction.options.getString('time');
                    const timezone = interaction.options.getString('timezone');
                    const start = parseTime(timeInput, timezone);

                    // Handle invalid time input
                    if (!start) {
                        return interaction.reply({ content: 'Invalid time input. Please use a valid time format e.g. "11:30 PM".', ephemeral: true });
                    }

                    // Common option
                    let options = {
                        start: start
                    };

                    if (subcommand === 'new') {
                        const templateId = interaction.options.getString('template-id');
                        const serverId = interaction.guild.id;
            
                        // Firestore document references
                        const templateDocRef = db.collection('templates').doc(templateId);
                        const serverTemplatesRef = db.collection('serverTemplates');
                        const serverTemplateQuery = serverTemplatesRef.where('serverId', '==', serverId).where('templateId', '==', templateId);

                        try {
                            const templateDoc = await templateDocRef.get();
                            const serverTemplateSnapshot = await serverTemplateQuery.get();

                            if (!templateDoc.exists) {
                                return interaction.reply({ content: 'Template does not exist. Please check the ID and try again.', ephemeral: true });
                            }

                            if (serverTemplateSnapshot.empty) {
                                return interaction.reply({ content: 'Template is not loaded in this server. Please load the template first.', ephemeral: true });
                            }
            
                            const templateData = templateDoc.data();
                            options.name = templateData.name;
                            options.thumbnail = templateData.thumbnail;
                            options.mainMax = templateData.mainMax;
                            options.waitlistMax = templateData.waitlistMax;
                        } catch (error) {
                            console.error('Error fetching template:', error);
                            return interaction.reply({ content: 'An error occurred while fetching the template. Please try again later.', ephemeral: true });
                        }
                    } else {
                        options.name = interaction.options.getString('name');
                        options.thumbnail = 'https://i.imgur.com/j1LmKzM.png';
                        options.mainMax = interaction.options.getInteger('queue-spots');
                        options.waitlistMax = interaction.options.getInteger('waitlist-spots');
                    }
            
                    // Validate queue spots
                    if (options.mainMax < 1) {
                        return interaction.reply({ content: 'Please input a valid number of queue spots (at least 1).', ephemeral: true });
                    }
                    else if (options.mainMax > 100) {
                        return interaction.reply({ content: 'Please input a valid number of queue spots (at most 100).', ephemeral: true });
                    }
            
                    // Validate waitlist spots
                    if (options.waitlistMax < 0) {
                        return interaction.reply({ content: 'Please input a valid number of waitlist spots (at least 0).', ephemeral: true });
                    }
                    else if (options.waitlistMax > 50) {
                        return interaction.reply({ content: 'Please input a valid number of waitlist spots (at most 50).', ephemeral: true });
                    }
            
                    // Initialize new Queue with options and send initial response
                    const queue = new Queue(queueKey, interaction, options);
                    await queue.sendResponse();

                    // Mark the user as having an active queue in this server
                    interaction.client.activeQueues.set(queueKey, queue);
            
                    // Collector for handling button interactions
                    const pending = queue.response.createMessageComponentCollector({
                        componentType: ComponentType.Button,
                        time: (queue.start - moment().unix()) * 1_000
                    });
            
                    pending.on('collect', async (i) => {
                        try {
                            if (i.customId === 'join') {
                                if (queue.main.has(i.user.id)) {
                                    await i.reply({ content: 'You are already in the queue.', ephemeral: true });
                                }
                                else if (queue.waitlist.has(i.user.id)) {
                                    await i.reply({ content: 'You are already in the waitlist.', ephemeral: true });
                                }
                                else if (queue.main.size + queue.numGuests < queue.mainMax) {
                                    queue.addMain(i.user);
                                    await queue.updateResponse();
                                    await i.reply({ content: 'You have been added to the queue.', ephemeral: true });
                                } else if (queue.waitlist.size < queue.waitlistMax) {
                                    queue.addWaitlist(i.user);
                                    await queue.updateResponse();
                                    await i.reply({ content: 'You have been added to the waitlist since the queue is full.', ephemeral: true });
                                } else {
                                    await i.reply({ content: 'Both the queue and the waitlist are full.', ephemeral: true });
                                }
                            }
                            if (i.customId === 'addGuest') {
                                if (queue.main.has(i.user.id)) {
                                    if (queue.main.get(i.user.id).guests >= maxGuests) {
                                        await i.reply({ content: `You have already hit the max of ${maxGuests} guest(s).`, ephemeral: true });
                                    } else if (queue.main.size + queue.numGuests < queue.mainMax) {
                                        queue.addGuest(i.user);
                                        await queue.updateResponse();
                                        await i.reply({ content: 'Your guest has been added to the queue.', ephemeral: true });
                                    } else {
                                        await i.reply({ content: 'The queue is full. Guests may not be added to the waitlist.', ephemeral: true });
                                    }
                                } else {
                                    await i.reply({ content: 'You must be in the queue to add a guest.', ephemeral: true });
                                }
                            }
                            if (i.customId === 'leave') {
                                if (queue.main.has(i.user.id)) {
                                    queue.removeMain(i.user)
                                    queue.fillMain();
                                    await queue.updateResponse();
                                    await i.reply({ content: 'You have been removed from the queue.', ephemeral: true });
                                } else if (queue.waitlist.has(i.user.id)) {
                                    queue.removeWaitlist(i.user);
                                    await queue.updateResponse();
                                    await i.reply({ content: 'You have been removed from the waitlist.', ephemeral: true });
                                } else {
                                    await i.reply({ content: 'You are not in the queue.', ephemeral: true });
                                }
                            }
                            if (i.customId === 'cancel') {
                                if (i.user.id === queueCreator) {
                                    queue.cancel();
                                    // TODO: Disable buttons
                                    await queue.updateResponse();
                                    pending.stop(); // Stop the collector when the queue is canceled
                                    await i.reply({ content: `The ${queue.name} queue for <t:${queue.start}:t> has been canceled`, ephemeral: true });
                                } else {
                                    await i.reply({ content: 'Only the queue creator can cancel the queue.', ephemeral: true });
                                }
                                return;
                            }
                        } catch (error) {
                            console.error('Error handling button interaction:', error);
                            await i.reply({ content: 'An error occurred while processing your request. Please try again later.', ephemeral: true });
                        }
                    });
            
                    // Handle the end of the queue collector
                    pending.on('end', async () => {
                        // Return if end condition is met
                        if (!interaction.client.activeQueues.has(queueKey)) return;

                        // Check for end condition
                        queue.checkEnd();

                        try {
                            queue.ready();
                            await queue.updateResponse();
                            
                            // Create readying collector
                            const readying = queue.response.createMessageComponentCollector({
                                componentType: ComponentType.Button
                            });
            
                            // Set timers for original users in the queue
                            queue.main.forEach(user => {
                                queue.setTimer(user);
                            });
            
                            readying.on('collect', async (i) => {
                                try {
                                    if (i.customId === 'readyUp') {
                                        if (queue.main.has(i.user.id)) {
                                            queue.readyUp(i.user);
                                            queue.checkEnd();
                                            await queue.updateResponse();
                                            await i.reply({ content: `<@${i.user.id}>, you have successfully readied up!`, ephemeral: true });
                                        } else {
                                            await i.reply({ content: 'You are not in the queue.', ephemeral: true });
                                        }
                                    }
                                    if (i.customId === 'leave') {
                                        if (queue.main.get(i.user.id)) {
                                            if (queue.main.get(i.user.id).ready) {
                                                await i.reply({ content: 'You cannot leave the queue after you have readied up.', ephemeral: true });
                                            } else {
                                                queue.removeMain(i.user);
                                                queue.fillMain();
                                                queue.checkEnd();
                                                await queue.updateResponse();
                                                await i.reply({ content: 'You have been removed from the queue.', ephemeral: true });
                                            }
                                        } else if (queue.waitlist.has(i.user.id)) {
                                            queue.removeWaitlist(i.user);
                                            queue.checkEnd();
                                            await queue.updateResponse();
                                            await i.reply({ content: 'You have been removed from the waitlist.', ephemeral: true });
                                        } else {
                                            await i.reply({ content: 'You are not in the queue or waitlist.', ephemeral: true });
                                        }
                                    }
                                    if (i.customId === 'cancel') {
                                        if (i.user.id === queueCreator) {
                                            queue.cancel();
                                            await queue.updateResponse();
                                            readying.stop(); // Stop the collector when the queue is canceled
                                            await i.reply({ content: `The ${queue.name} queue for <t:${queue.start}:t> has been canceled`, ephemeral: true });
                                        } else {
                                            await i.reply({ content: 'Only the queue creator can cancel the queue.', ephemeral: true });
                                        }
                                    }
                                } catch (error) {
                                    console.error('Error handling button interaction:', error);
                                    await i.reply({ content: 'An error occurred while processing your request. Please try again later.', ephemeral: true });
                                }
                            });
                        } catch (error) {
                            if (error.code !== 10008) { // Ignore "Unknown Message" error
                                console.error('Failed to update message:', error);
                            }
                        }
                    });
                } catch (error) {
                    console.error('Error handling the command:', error);
                    interaction.reply({ content: 'An error occurred while processing your request. Please try again later.', ephemeral: true });
                }
                break;
            }
            case 'kick': {
                const userToKick = interaction.options.getUser('user');

                // Validate if the command issuer is the queue creator
                if (interaction.client.activeQueues.has(queueKey)) {
                    const queue = activeQueues.get(queueKey);

                    // Check if user is trying to kick themselves
                    if (userToKick.id === interaction.user.id) {
                        await interaction.reply({ content: 'You may not kick yourself from your own queue.', ephemeral: true });
                    } else if (queue.main.has(userToKick.id)) {
                        queue.removeMain(userToKick)
                        queue.fillMain();
                        await queue.updateResponse();
                        await i.reply({ content: `${userToKick} has been removed from the queue.`, ephemeral: true });
                    } else if (queue.waitlist.has(userToKick.id)) {
                        queue.removeWaitlist(userToKick);
                        await queue.updateResponse();
                        await i.reply({ content: `${userToKick} has been removed from the waitlist.`, ephemeral: true });
                    } else {
                        await interaction.reply({ content: `${userToKick} is not in the queue or waitlist.`, ephemeral: true });
                    }

                } else {
                    await interaction.reply({ content: 'You do not have an active queue to kick users from.', ephemeral: true });
                }
                break;
            }
            default: {
                interaction.reply({ content: 'Unknown subcommand', ephemeral: true });
                break;
            }
        }
    },
};