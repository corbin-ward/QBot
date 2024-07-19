const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } = require('discord.js');
const { timezones } = require('../../utils/timezones');
const moment = require('moment-timezone');
const mongoose = require('mongoose');
const templatesModel = require('../../models/templates');
const serverTemplatesModel = require('../../models/servertemplates');

// Function to parse the provided time input into a valid time object in the specified timezone
function parseTime(input, timezone) {
    const formats = [
        'h:mm A', 'h:mmA', 'h A', 'hA', 'H', 'H:mm'
    ];
    const now = moment.tz(timezone);
    let parsedTime = moment.tz(input, formats, true, timezone);

    // If the parsed time is invalid, return null
    if (!parsedTime.isValid()) {
        return null;
    }

    // If the parsed time is before now, set it to the next day
    if (parsedTime.isBefore(now)) {
        parsedTime.add(1, 'day');
    }

    // Set the date to today
    parsedTime.set({
        year: now.year(),
        month: now.month(),
        date: now.date()
    });

    // If the time has already passed today, move it to tomorrow
    if (parsedTime.isBefore(now)) {
        parsedTime.add(1, 'day');
    }

    return parsedTime;
}

// Export the module which defines the slash command and its logic
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
                    .setDescription('Number of spots in the main queue')
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
        ),
    async autocomplete(interaction) {
        // handle the autocompletion response
        const subcommand = interaction.options.getSubcommand();
        const focusedOption = interaction.options.getFocused();

        switch (subcommand) {
            case 'new': {
                try {
                    const serverId = interaction.guild.id;
                    const serverTemplates = await serverTemplatesModel.find({ serverId: serverId }).populate('templateId');

                    const choices = serverTemplates.map(serverTemplate => ({
                        name: `${serverTemplate.templateId.name} by ${serverTemplate.templateId.creatorUsername}`,
                        value: serverTemplate.templateId._id.toString()
                    }));
                    const filtered = choices.filter(choice => 
                        choice.name.toLowerCase().includes(focusedOption.toLowerCase()) || 
                        choice.value.toLowerCase().includes(focusedOption.toLowerCase())
                    );
                    await interaction.respond(filtered);
                } catch (error) {
                    console.error('Error fetching templates for new queue:', error);
                    await interaction.respond([]);
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
        
        switch (subcommand) {
            case 'new':
            case 'manual': {
                try {
                    const maxGuests = 1;
                    const timeToReadyUp = 1; // Time in minutes to ready up
                    const queueCreator = interaction.user.id;
                    
                    const timeInput = interaction.options.getString('time');
                    const timezone = interaction.options.getString('timezone');

                    let name, queueSpots, waitlistSpots;

                    if (subcommand === 'new') {
                        const templateId = interaction.options.getString('template-id');
                        const serverId = interaction.guild.id;

                        // Validate the template ID
                        if (!mongoose.Types.ObjectId.isValid(templateId)) {
                            return interaction.reply({ content: 'Invalid template ID. Please provide a valid ID.', ephemeral: true });
                        }

                        try {
                            const template = await templatesModel.findById(templateId);

                            // Check if template exists
                            if (!template) {
                                return interaction.reply({ content: 'Template does not exist. Please check the ID and try again.', ephemeral: true });
                            }

                            const serverTemplate = await serverTemplatesModel.findOne({ serverId: serverId, templateId: templateId });

                            // Check if the template is loaded in the server
                            if (!serverTemplate) {
                                return interaction.reply({ content: 'Template is not loaded in this server. Please load the template first.', ephemeral: true });
                            }

                            name = template.name;
                            thumbnailURL = template.iconUrl;
                            queueSpots = template.queueSpots;
                            waitlistSpots = template.waitlistSpots;
                        } catch (error) {
                            console.error('Error fetching template:', error);
                            return interaction.reply({ content: 'An error occurred while fetching the template. Please try again later.', ephemeral: true });
                        }
                    } else {
                        name = interaction.options.getString('name');
                        thumbnailURL = 'https://i.imgur.com/j1LmKzM.png';
                        queueSpots = interaction.options.getInteger('queue-spots');
                        waitlistSpots = interaction.options.getInteger('waitlist-spots');
                    }
            
                    const startTime = parseTime(timeInput, timezone);
            
                    // Check if the user already has an active queue
                    if (interaction.client.activeQueues.has(queueCreator)) {
                        return interaction.reply({ content: 'You already have an active queue. You can create a new one after your current queue starts or is canceled.', ephemeral: true });
                    }
            
                    // Validate queue spots
                    if (queueSpots < 1) {
                        return interaction.reply({ content: 'Please input a valid number of main queue spots (at least 1).', ephemeral: true });
                    }
                    else if (queueSpots > 100) {
                        return interaction.reply({ content: 'Please input a valid number of main queue spots (at most 100).', ephemeral: true });
                    }
            
                    // Validate waitlist spots
                    if (waitlistSpots < 0) {
                        return interaction.reply({ content: 'Please input a valid number of waitlist spots (at least 0).', ephemeral: true });
                    }
                    else if (queueSpots > 50) {
                        return interaction.reply({ content: 'Please input a valid number of waitlist spots (at most 50).', ephemeral: true });
                    }
            
                    // Handle invalid time input
                    if (!startTime) {
                        return interaction.reply({ content: 'Invalid time input. Please use a valid time format e.g. "11:30 PM".', ephemeral: true });
                    }
            
                    const unixStart = Math.floor(startTime.unix());
            
                    let guestCount = 0;
                    let mainQueue = new Map();
                    let waitlist = new Map();
                    let userReadyUpTimes = new Map();
                    let cancelled = false;
            
                    // Create the embed message for the queue
                    const queueEmbed = new EmbedBuilder()
                        .setColor(0x5A6AEF)
                        .setAuthor({ name: `Started by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL()})
                        .setTitle(name)
                        .setDescription(`Starts at <t:${unixStart}:t>`)
                        .setThumbnail(thumbnailURL)
                        .addFields(
                            { name: 'Main Queue', value: `${queueSpots}/${queueSpots} Spots Left\n\n\u200B`, inline: true },
                            { name: 'Waitlist', value: `${waitlistSpots}/${waitlistSpots} Spots Left\n\n\u200B`, inline: true }
                        )
                        .setFooter({ text: 'Created using QBot', iconURL: 'https://i.imgur.com/j1LmKzM.png' })
                        .setTimestamp();
                    
                    // Create the buttons for the queue
                    const join = new ButtonBuilder()
                        .setCustomId('join')
                        .setLabel('Join')
                        .setStyle(ButtonStyle.Primary);
            
                    const addGuest = new ButtonBuilder()
                        .setCustomId('addGuest')
                        .setLabel('Add Guest')
                        .setStyle(ButtonStyle.Secondary);
            
                    const readyUp = new ButtonBuilder()
                        .setCustomId('readyUp')
                        .setLabel('Ready Up')
                        .setStyle(ButtonStyle.Success);
            
                    const leave = new ButtonBuilder()
                        .setCustomId('leave')
                        .setLabel('Leave')
                        .setStyle(ButtonStyle.Secondary);
            
                    const cancel = new ButtonBuilder()
                        .setCustomId('cancel')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Danger);
            
                    // Arrange the buttons in an action row
                    const queueButtons = new ActionRowBuilder()
                        .addComponents(join, addGuest, leave, cancel);
            
                    const readyUpButtons = new ActionRowBuilder()
                        .addComponents(readyUp, leave, cancel);
            
                    const response = await interaction.reply({
                        embeds: [queueEmbed],
                        components: [queueButtons],
                        fetchReply: true
                    });
            
                    // Mark the user as having an active queue
                    interaction.client.activeQueues.set(queueCreator, true);
            
                    // Function to update the queue embed with the latest information
                    function updateQueueEmbed() {
                        const mainQueueNames = Array.from(mainQueue.values())
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
                        
                        const waitlistNames = Array.from(waitlist.values())
                            .flatMap(user => {
                                const names = [];
                                const checkmark = user.ready ? '✅' : '';
                                names.push(`${user.username} ${checkmark}`);
                                return names;
                            })
                            .join('\n');
                        
                        queueEmbed.setFields(
                            { name: 'Main Queue', value: `${queueSpots - mainQueue.size - guestCount}/${queueSpots} Spots Left\n\n${mainQueueNames}\n\u200B`, inline: true },
                            { name: 'Waitlist', value: `${waitlistSpots - waitlist.size}/${waitlistSpots} Spots Left\n\n${waitlistNames}\n\u200B`, inline: true }
                        );
                    }
            
                    // Function to check the queue status
                    function checkQueue(collector) {
                        if (((mainQueue.size + guestCount >= queueSpots) && (Array.from(mainQueue.values()).every(user => user.ready))) || ((waitlist.size === 0) && (Array.from(mainQueue.values()).every(user => user.ready)))) {
                            collector.stop();
                            queueEmbed
                                .setColor(0x4E5058)
                                .setTitle(`${name} - Closed`);
                            response.edit({ embeds: [queueEmbed], components: [] });
                        }
                    }
            
                    // Function to move users from the waitlist to the main queue
                    function moveFromWaitlistToQueue() {
                        while (mainQueue.size + guestCount < queueSpots && waitlist.size > 0) {
                            const [userId, user] = waitlist.entries().next().value;
                            waitlist.delete(userId);
                            mainQueue.set(userId, user);
                            setReadyUpTimer(user);
                        }
                        updateQueueEmbed();
                        response.edit({ embeds: [queueEmbed] });
                    }
            
                    // Function to set the ready-up timer for users
                    function setReadyUpTimer(user, collector) {
                        const readyUpEndTime = Date.now() + timeToReadyUp * 60 * 1_000;
                        const readyUpTimestamp = Math.round(readyUpEndTime / 1_000);
                        userReadyUpTimes.set(user.id, readyUpEndTime);
            
                        // Send a DM to the user notifying them to ready up
                        interaction.client.users.fetch(user.id).then(userObj => {
                            userObj.send(`${name} in ${interaction.guild.name} is starting!\n\nQueue Link: ${response.url}\n\nYou must ready up <t:${readyUpTimestamp}:R> or you'll be removed from the queue.`);
                        });
            
                        setTimeout(async () => {
                            if (userReadyUpTimes.get(user.id) === readyUpEndTime) {
                                guestCount = guestCount - mainQueue.get(user.id).guests;
                                mainQueue.delete(user.id);
                                waitlist.delete(user.id);
                                userReadyUpTimes.delete(user.id);
            
                                // Send a DM to the user notifying them they have been removed from the queue
                                interaction.client.users.fetch(user.id).then(userObj => {
                                    userObj.send(`You did not ready up in time and have been removed from the queue for ${name} in ${interaction.guild.name}.`);
                                });
            
                                checkQueue(collector);
                                moveFromWaitlistToQueue();
                                updateQueueEmbed();
                                await response.edit({ embeds: [queueEmbed] });
                            }
                        }, timeToReadyUp * 60 * 1_000);
                    }
            
                    // Collector for handling button interactions
                    const queueCollector = response.createMessageComponentCollector({
                        componentType: ComponentType.Button,
                        time: (unixStart - moment().unix()) * 1_000
                    });
            
                    queueCollector.on('collect', async (i) => {
                        try {
                            if (i.customId === 'join') {
                                if (mainQueue.size + guestCount < queueSpots) {
                                    mainQueue.set(i.user.id, { id: i.user.id, username: i.user.username, guests: 0, ready: false });
                                    updateQueueEmbed();
                                    await i.update({ embeds: [queueEmbed] });
                                    await i.followUp({ content: 'Your have been added to the queue.', ephemeral: true });
                                } else if (waitlist.size < waitlistSpots) {
                                    waitlist.set(i.user.id, { id: i.user.id, username: i.user.username, guests: 0, ready: false });
                                    updateQueueEmbed();
                                    await i.update({ embeds: [queueEmbed] });
                                    await i.followUp({ content: 'Your have been added to the waitlist since the queue is full.', ephemeral: true });
                                } else {
                                    await i.reply({ content: 'Both the main queue and the waitlist are full.', ephemeral: true });
                                    return;
                                }
                            }
                            if (i.customId === 'addGuest') {
                                if (mainQueue.has(i.user.id)) {
                                    if (mainQueue.get(i.user.id).guests >= maxGuests) {
                                        await i.reply({ content: `You have already hit the max of ${maxGuests} guest(s).`, ephemeral: true });
                                        return;
                                    } else if (mainQueue.size + guestCount < queueSpots) {
                                        mainQueue.get(i.user.id).guests++;
                                        guestCount++;
                                        updateQueueEmbed();
                                        await i.update({ embeds: [queueEmbed] });
                                        await i.followUp({ content: 'Your guest has been added to the queue.', ephemeral: true });
                                    } else {
                                        await i.reply({ content: 'The main queue is full. Guests may not be added to the waitlist.', ephemeral: true });
                                        return;
                                    }
                                } else {
                                    await i.reply({ content: 'You must be in the main queue to add a guest.', ephemeral: true });
                                    return;
                                }
                            }
                            if (i.customId === 'leave') {
                                if (mainQueue.has(i.user.id)) {
                                    guestCount = guestCount - mainQueue.get(i.user.id).guests;
                                    mainQueue.delete(i.user.id);
                                    updateQueueEmbed();
                                    await i.update({ embeds: [queueEmbed] });
                                    await i.followUp({ content: 'You have been removed from the queue.', ephemeral: true });
                                } else if (waitlist.has(i.user.id)) {
                                    waitlist.delete(i.user.id);
                                    updateQueueEmbed();
                                    await i.update({ embeds: [queueEmbed] });
                                    await i.followUp({ content: 'You have been removed from the waitlist.', ephemeral: true });
                                } else {
                                    await i.reply({ content: 'You are not in the queue.', ephemeral: true });
                                    return;
                                }
                            }
                            if (i.customId === 'cancel') {
                                if (i.user.id === queueCreator) {
                                    cancelled = true;
                                    queueCollector.stop(); // Stop the collector when the queue is canceled
                                    queueEmbed
                                        .setColor(0xD83941)
                                        .setTitle(`${name} - Cancelled`)
                                        .setDescription(`Cancelled before <t:${unixStart}:t>`);  
                                    const disabledQueueButtons = new ActionRowBuilder()  
                                        .addComponents(
                                            join.setDisabled(true),
                                            addGuest.setDisabled(true),
                                            leave.setDisabled(true),
                                            cancel.setDisabled(true)
                                        );
                                    await response.edit({ embeds: [queueEmbed], components: [disabledQueueButtons] });
                                    interaction.client.activeQueues.delete(queueCreator);
                                    await i.reply({ content: `The ${name} queue for <t:${unixStart}:t> has been canceled`, ephemeral: true });
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
                    queueCollector.on('end', async () => {
                        if (cancelled == true) return;

                        try {
                            if (cancelled !== true) {}
                            queueEmbed
                                .setColor(0x297F48)
                                .setDescription(`Started at <t:${unixStart}:t>`);
                            await response.edit({ embeds: [queueEmbed], components: [readyUpButtons] });
            
                            const readyUpCollector = response.createMessageComponentCollector({
                                componentType: ComponentType.Button
                            });
            
                            // Set timers for original users in the main queue
                            mainQueue.forEach((user) => {
                                setReadyUpTimer(user, readyUpCollector);
                            });
            
                            checkQueue(readyUpCollector);
            
                            readyUpCollector.on('collect', async (i) => {
                                try {
                                    if (i.customId === 'readyUp') {
                                        if (mainQueue.has(i.user.id)) {
                                            mainQueue.get(i.user.id).ready = true;
                                            userReadyUpTimes.delete(i.user.id);
                
                                            updateQueueEmbed();
                                            await i.update({ embeds: [queueEmbed] });
                                            // Notify the user they have successfully readied up
                                            await i.followUp({ content: `<@${i.user.id}>, you have successfully readied up!`, ephemeral: true });
                                            checkQueue(readyUpCollector);
                                        } else {
                                            await i.reply({ content: 'You are not in the main queue.', ephemeral: true });
                                        }
                                    }
                                    if (i.customId === 'leave') {
                                        const user = mainQueue.get(i.user.id);
                                        if (user && mainQueue.get(i.user.id).ready) {
                                            await i.reply({ content: 'You cannot leave the queue after you have readied up.', ephemeral: true });
                                            return;
                                        }
                
                                        if (mainQueue.has(i.user.id)) {
                                            guestCount = guestCount - mainQueue.get(i.user.id).guests;
                                            mainQueue.delete(i.user.id);
                                            userReadyUpTimes.delete(i.user.id);
                                            checkQueue(readyUpCollector);
                                            moveFromWaitlistToQueue();
                                            updateQueueEmbed();
                                            await i.update({ embeds: [queueEmbed] });
                                            await i.followUp({ content: 'You have been removed from the queue.', ephemeral: true });
                                        } else if (waitlist.has(i.user.id)) {
                                            waitlist.delete(i.user.id);
                                            checkQueue(readyUpCollector);
                                            updateQueueEmbed();
                                            await i.update({ embeds: [queueEmbed] });
                                            await i.followUp({ content: 'You have been removed from the waitlist.', ephemeral: true });
                                        } else {
                                            await i.reply({ content: 'You are not in the queue.', ephemeral: true });
                                            return;
                                        }
                                    }
                                    if (i.customId === 'cancel') {
                                        if (i.user.id === queueCreator) {
                                            readyUpCollector.stop(); // Stop the collector when the queue is canceled
                                            userReadyUpTimes.clear();
                                            queueEmbed
                                                .setColor(0xD83941)
                                                .setTitle(`${name} - Cancelled`)
                                                .setDescription(`Cancelled after <t:${unixStart}:t>`);  
                                            const disabledReadyButtons = new ActionRowBuilder()  
                                                .addComponents(
                                                    readyUp.setDisabled(true),
                                                    leave.setDisabled(true),
                                                    cancel.setDisabled(true)
                                                );
                                            await response.edit({ embeds: [queueEmbed], components: [disabledReadyButtons] });
                                            interaction.client.activeQueues.delete(queueCreator);
                                            await i.reply({ content: `The ${name} queue for <t:${unixStart}:t> has been canceled`, ephemeral: true });
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
                        } catch (error) {
                            if (error.code !== 10008) { // Ignore "Unknown Message" error
                                console.error('Failed to update message:', error);
                            }
                        }
            
                        // Clear the active queue status
                        interaction.client.activeQueues.delete(queueCreator);
                    });
                } catch (error) {
                    console.error('Error handling the command:', error);
                    interaction.reply({ content: 'An error occurred while processing your request. Please try again later.', ephemeral: true });
                }
                break;
            }
            case 'kick': {
                // TODO: Implement kick logic
            }
            default: {
                interaction.reply({ content: 'Unknown subcommand', ephemeral: true });
                break;
            }
        }
    },
};