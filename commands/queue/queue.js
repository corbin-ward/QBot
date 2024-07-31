const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, Collection } = require('discord.js');
const { timezones } = require('../../utils/timezones');
const moment = require('moment-timezone');
const { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where } = require('firebase/firestore');
const db = getFirestore();

const maxGuests = 1;
const timeToReadyUp = 1; // Time in minutes to ready up

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

// Function to update the embed and status
async function updateStatus(queueData, status) {
    const joinButton = new ButtonBuilder()
        .setCustomId('join')
        .setLabel('Join')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(status !== 'pending');

    const addGuestButton = new ButtonBuilder()
        .setCustomId('addGuest')
        .setLabel('Add Guest')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(status !== 'pending');

    const readyUpButton = new ButtonBuilder()
        .setCustomId('readyUp')
        .setLabel('Ready Up')
        .setStyle(ButtonStyle.Success)
        .setDisabled(status !== 'readying');

    const leaveButton = new ButtonBuilder()
        .setCustomId('leave')
        .setLabel('Leave')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(status === 'canceled' || status === 'closed');

    const cancelButton = new ButtonBuilder()
        .setCustomId('cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(status === 'canceled' || status === 'closed');

    const queueButtons = new ActionRowBuilder()
        .addComponents(joinButton, addGuestButton, leaveButton, cancelButton);

    const readyUpButtons = new ActionRowBuilder()
        .addComponents(readyUpButton, leaveButton, cancelButton);

    prevStatus = queueData.status;
    queueData.status = status;
    queueData.buttons = (status === 'readying') ? readyUpButtons : queueButtons;
    
    switch (status) {
        case 'pending': {
            queueData.queueEmbed
                .setColor(0x5A6AEF)
                .setTitle(queueData.name)
                .setDescription(`Starts at <t:${queueData.start}:t>`);
            break;
        }
        case 'readying': {
            queueData.queueEmbed
                .setColor(0x297F48)
                .setTitle(`${queueData.name} - Readying Up`)
                .setDescription(`Closed at <t:${queueData.start}:t>`);
            break;
        }
        case 'canceled': {
            if(prevStatus === 'readying') {
                queueData.queueEmbed
                    .setColor(0xD83941)
                    .setTitle(`${queueData.name} - Canceled`)
                    .setDescription(`Canceled after <t:${queueData.start}:t>`);
            } else {
                queueData.queueEmbed
                    .setColor(0xD83941)
                    .setTitle(`${queueData.name} - Canceled`)
                    .setDescription(`Canceled before <t:${queueData.start}:t>`);
            }
            break;
        }
        case 'closed': {
            if(prevStatus === 'readying') {
                queueData.queueEmbed
                    .setColor(0x7D50A0)
                    .setTitle(`${queueData.name} - Started`)
                    .setDescription(`Started at <t:${queueData.start}:t>`);
            } else {
                queueData.queueEmbed
                    .setColor(0x4E5058)
                    .setTitle(`${queueData.name} - Closed`)
                    .setDescription(`Closed at <t:${queueData.start}:t>`);
            }
            break;
        }
        default: {
            break;
        }
    }

    const mainQueueNames = Array.from(queueData.mainQueue.values())
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

    const waitlistNames = Array.from(queueData.waitlist.values())
        .flatMap(user => {
            const names = [];
            const checkmark = user.ready ? '✅' : '';
            names.push(`${user.username} ${checkmark}`);
            return names;
        })
        .join('\n');

    queueData.queueEmbed.setFields(
        { name: 'Main Queue', value: `${queueData.queueSpots - queueData.mainQueue.size - queueData.guestCount}/${queueData.queueSpots} Spots Left\n\n${mainQueueNames}\n\u200B`, inline: true },
        { name: 'Waitlist', value: `${queueData.waitlistSpots - queueData.waitlist.size}/${queueData.waitlistSpots} Spots Left\n\n${waitlistNames}\n\u200B`, inline: true }
    );

    await queueData.response.edit({ embeds: [queueData.queueEmbed], components: [queueData.buttons] });
}

// Function to move users from the waitlist to the main queue
function waitlistToQueue(queueData) {
    while (queueData.mainQueue.size + queueData.guestCount < queueData.queueSpots && queueData.waitlist.size > 0) {
        const [userId, user] = queueData.waitlist.entries().next().value;
        queueData.waitlist.delete(userId);
        queueData.mainQueue.set(userId, user);
        setReadyUpTimer(queueData, user);
    }
}

// Function to check the queue status
function checkQueue(queueData) {
    if (((queueData.mainQueue.size + queueData.guestCount >= queueData.queueSpots) && (Array.from(queueData.mainQueue.values()).every(user => user.ready))) || ((queueData.waitlist.size === 0) && (Array.from(queueData.mainQueue.values()).every(user => user.ready)))) {
        updateStatus(queueData, 'closed');
        queueData.collector.stop();
    }
    else {
        updateStatus(queueData, queueData.status);
    }
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

        switch (subcommand) {
            case 'new': {
                try {
                    const serverId = interaction.guild.id;
                    const serverTemplatesCol = collection(db, 'serverTemplates');
                    const q = query(serverTemplatesCol, where('serverId', '==', serverId));
                    const querySnapshot = await getDocs(q);

                    const choices = [];
                    for (const docSnapshot of querySnapshot.docs) {
                        const serverTemplate = docSnapshot.data();
                        const templateDocRef = doc(db, 'templates', serverTemplate.templateId); // Correct use of doc
                        const templateDoc = await getDoc(templateDocRef);
                        if (templateDoc.exists()) {
                            choices.push({
                                name: `${templateDoc.data().name} by ${templateDoc.data().creatorUsername}`,
                                value: serverTemplate.templateId
                            });
                        }
                    }

                    const filtered = choices.filter(choice => 
                        choice.name.toLowerCase().includes(focusedOption.toLowerCase()) || 
                        choice.value.toLowerCase().includes(focusedOption.toLowerCase())
                    );
                    await interaction.respond(filtered);
                } catch (error) {
                    console.error('Error fetching templates for template new autocomplete:', error);
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
        
        // Define a composite key for active queues using user ID and server ID
        const queueKey = `${interaction.user.id}-${interaction.guild.id}`;

        // Access or initialize the queue data for the user in this server
        let queueData = interaction.client.activeQueues.get(queueKey) || {
            name: null,
            start: null,
            queueSpots: 1,
            waitlistSpots: 0,
            mainQueue: new Map(),
            waitlist: new Map(),
            guestCount: 0,
            userReadyUpTimes: new Map(),
            queueEmbed: null,
            buttons: null,
            response: null,
            status: 'pending',
            collector: null,
        };

        // Function to set the ready-up timer for users
        function setReadyUpTimer(queueData, user) {
            const readyUpEndTime = Date.now() + timeToReadyUp * 60 * 1_000;
            const readyUpTimestamp = Math.round(readyUpEndTime / 1_000);
            queueData.userReadyUpTimes.set(user.id, readyUpEndTime);

            // Send a DM to the user notifying them to ready up
            interaction.client.users.fetch(user.id).then(userObj => {
                userObj.send(`${queueData.name} in ${interaction.guild.name} is starting!\n\nQueue Link: ${queueData.response.url}\n\nYou must ready up <t:${readyUpTimestamp}:R> or you'll be removed from the queue.`);
            });

            setTimeout(async () => {
                if (queueData.userReadyUpTimes.get(user.id) === readyUpEndTime) {
                    queueData.guestCount = queueData.guestCount - queueData.mainQueue.get(user.id).guests;
                    queueData.mainQueue.delete(user.id);
                    queueData.waitlist.delete(user.id);
                    queueData.userReadyUpTimes.delete(user.id);

                    // Send a DM to the user notifying them they have been removed from the queue
                    interaction.client.users.fetch(user.id).then(userObj => {
                        userObj.send(`You did not ready up in time and have been removed from the queue for ${queueData.name} in ${interaction.guild.name}.`);
                    });

                    waitlistToQueue(queueData);
                    checkQueue(queueData);
                }
            }, timeToReadyUp * 60 * 1_000);
        }

        switch (subcommand) {
            case 'new':
            case 'manual': {
                try {
                    const queueCreator = interaction.user.id;
                    
                    const timeInput = interaction.options.getString('time');
                    const timezone = interaction.options.getString('timezone');

                    if (subcommand === 'new') {
                        const templateId = interaction.options.getString('template-id');
                        const serverId = interaction.guild.id;
            
                        // Firestore document references
                        const templateDocRef = doc(db, 'templates', templateId);
                        const serverTemplateQuery = query(collection(db, 'serverTemplates'), where('serverId', '==', serverId), where('templateId', '==', templateId));
            
                        try {
                            const templateDoc = await getDoc(templateDocRef);
                            const serverTemplateSnapshot = await getDocs(serverTemplateQuery);
            
                            if (!templateDoc.exists()) {
                                return interaction.reply({ content: 'Template does not exist. Please check the ID and try again.', ephemeral: true });
                            }
            
                            if (serverTemplateSnapshot.empty) {
                                return interaction.reply({ content: 'Template is not loaded in this server. Please load the template first.', ephemeral: true });
                            }
            
                            // Assuming template data is stored similar to the Mongoose model
                            const templateData = templateDoc.data();
                            queueData.name = templateData.name;
                            thumbnailURL = templateData.iconUrl;
                            queueData.queueSpots = templateData.queueSpots;
                            queueData.waitlistSpots = templateData.waitlistSpots;
                        } catch (error) {
                            console.error('Error fetching template:', error);
                            return interaction.reply({ content: 'An error occurred while fetching the template. Please try again later.', ephemeral: true });
                        }
                    } else {
                        queueData.name = interaction.options.getString('name');
                        thumbnailURL = 'https://i.imgur.com/j1LmKzM.png';
                        queueData.queueSpots = interaction.options.getInteger('queue-spots');
                        queueData.waitlistSpots = interaction.options.getInteger('waitlist-spots');
                    }
            
                    const startTime = parseTime(timeInput, timezone);
            
                    // Check if the user already has an active queue in this server
                    if (interaction.client.activeQueues.has(queueKey)) {
                        return interaction.reply({ content: 'You already have an active queue in this server. You can create a new one after your current queue starts or is canceled.', ephemeral: true });
                    }
            
                    // Validate queue spots
                    if (queueData.queueSpots < 1) {
                        return interaction.reply({ content: 'Please input a valid number of main queue spots (at least 1).', ephemeral: true });
                    }
                    else if (queueData.queueSpots > 100) {
                        return interaction.reply({ content: 'Please input a valid number of main queue spots (at most 100).', ephemeral: true });
                    }
            
                    // Validate waitlist spots
                    if (queueData.waitlistSpots < 0) {
                        return interaction.reply({ content: 'Please input a valid number of waitlist spots (at least 0).', ephemeral: true });
                    }
                    else if (queueData.waitlistSpots > 50) {
                        return interaction.reply({ content: 'Please input a valid number of waitlist spots (at most 50).', ephemeral: true });
                    }
            
                    // Handle invalid time input
                    if (!startTime) {
                        return interaction.reply({ content: 'Invalid time input. Please use a valid time format e.g. "11:30 PM".', ephemeral: true });
                    }
            
                    queueData.start = Math.floor(startTime.unix());
            
                    // Create the embed message for the queue
                    queueData.queueEmbed = new EmbedBuilder()
                        .setColor(0x5A6AEF)
                        .setAuthor({ name: `Started by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL()})
                        .setTitle(queueData.name)
                        .setDescription(`Starts at <t:${queueData.start}:t>`)
                        .setThumbnail(thumbnailURL)
                        .addFields(
                            { name: 'Main Queue', value: `${queueData.queueSpots}/${queueData.queueSpots} Spots Left\n\n\n\u200B`, inline: true },
                            { name: 'Waitlist', value: `${queueData.waitlistSpots}/${queueData.waitlistSpots} Spots Left\n\n\n\u200B`, inline: true }
                        )
                        .setFooter({ text: 'Created using QBot', iconURL: 'https://i.imgur.com/j1LmKzM.png' })
                        .setTimestamp();

                    queueData.response = await interaction.reply({
                        embeds: [queueData.queueEmbed],
                        fetchReply: true
                    });
            
                    // Mark the user as having an active queue in this server
                    interaction.client.activeQueues.set(queueKey, queueData);
                    updateStatus(queueData, 'pending');
            
                    // Collector for handling button interactions
                    const queueCollector = queueData.response.createMessageComponentCollector({
                        componentType: ComponentType.Button,
                        time: (queueData.start - moment().unix()) * 1_000
                    });

                    queueData.collector = queueCollector;
            
                    queueCollector.on('collect', async (i) => {
                        try {
                            if (i.customId === 'join') {
                                if (queueData.mainQueue.size + queueData.guestCount < queueData.queueSpots) {
                                    queueData.mainQueue.set(i.user.id, { id: i.user.id, username: i.user.username, guests: 0, ready: false });
                                    updateStatus(queueData, queueData.status);
                                    await i.reply({ content: 'You have been added to the queue.', ephemeral: true });
                                } else if (queueData.waitlist.size < queueData.waitlistSpots) {
                                    queueData.waitlist.set(i.user.id, { id: i.user.id, username: i.user.username, guests: 0, ready: false });
                                    updateStatus(queueData, queueData.status);
                                    await i.reply({ content: 'You have been added to the waitlist since the queue is full.', ephemeral: true });
                                } else {
                                    await i.reply({ content: 'Both the main queue and the waitlist are full.', ephemeral: true });
                                    return;
                                }
                            }
                            if (i.customId === 'addGuest') {
                                if (queueData.mainQueue.has(i.user.id)) {
                                    if (queueData.mainQueue.get(i.user.id).guests >= maxGuests) {
                                        await i.reply({ content: `You have already hit the max of ${maxGuests} guest(s).`, ephemeral: true });
                                        return;
                                    } else if (queueData.mainQueue.size + queueData.guestCount < queueData.queueSpots) {
                                        queueData.mainQueue.get(i.user.id).guests++;
                                        queueData.guestCount++;
                                        updateStatus(queueData, queueData.status);
                                        await i.reply({ content: 'Your guest has been added to the queue.', ephemeral: true });
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
                                if (queueData.mainQueue.has(i.user.id)) {
                                    queueData.guestCount = queueData.guestCount - queueData.mainQueue.get(i.user.id).guests;
                                    queueData.mainQueue.delete(i.user.id);
                                    waitlistToQueue(queueData);
                                    updateStatus(queueData, queueData.status);
                                    await i.reply({ content: 'You have been removed from the queue.', ephemeral: true });
                                } else if (queueData.waitlist.has(i.user.id)) {
                                    queueData.waitlist.delete(i.user.id);
                                    updateStatus(queueData, queueData.status);
                                    await i.reply({ content: 'You have been removed from the waitlist.', ephemeral: true });
                                } else {
                                    await i.reply({ content: 'You are not in the queue.', ephemeral: true });
                                    return;
                                }
                            }
                            if (i.customId === 'cancel') {
                                if (i.user.id === queueCreator) {
                                    updateStatus(queueData, 'canceled'); 
                                    queueCollector.stop(); // Stop the collector when the queue is canceled
                                    interaction.client.activeQueues.delete(queueKey);
                                    await i.reply({ content: `The ${queueData.name} queue for <t:${queueData.start}:t> has been canceled`, ephemeral: true });
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
                        if (queueData.status === 'canceled') return;

                        try {
                            updateStatus(queueData, 'readying');
            
                            const readyUpCollector = queueData.response.createMessageComponentCollector({
                                componentType: ComponentType.Button
                            });

                            queueData.collector = readyUpCollector;
            
                            // Set timers for original users in the main queue
                            queueData.mainQueue.forEach((user) => {
                                setReadyUpTimer(queueData, user);
                            });
            
                            checkQueue(queueData);
            
                            readyUpCollector.on('collect', async (i) => {
                                try {
                                    if (i.customId === 'readyUp') {
                                        if (queueData.mainQueue.has(i.user.id)) {
                                            queueData.mainQueue.get(i.user.id).ready = true;
                                            queueData.userReadyUpTimes.delete(i.user.id);
                                            checkQueue(queueData);
                                            // Notify the user they have successfully readied up
                                            await i.reply({ content: `<@${i.user.id}>, you have successfully readied up!`, ephemeral: true });
                                        } else {
                                            await i.reply({ content: 'You are not in the main queue.', ephemeral: true });
                                        }
                                    }
                                    if (i.customId === 'leave') {
                                        const user = queueData.mainQueue.get(i.user.id);
                                        if (user && queueData.mainQueue.get(i.user.id).ready) {
                                            await i.reply({ content: 'You cannot leave the queue after you have readied up.', ephemeral: true });
                                            return;
                                        }
                
                                        if (queueData.mainQueue.has(i.user.id)) {
                                            queueData.guestCount = queueData.guestCount - queueData.mainQueue.get(i.user.id).guests;
                                            queueData.mainQueue.delete(i.user.id);
                                            queueData.userReadyUpTimes.delete(i.user.id);
                                            waitlistToQueue(queueData);
                                            checkQueue(queueData);
                                            await i.reply({ content: 'You have been removed from the queue.', ephemeral: true });
                                        } else if (queueData.waitlist.has(i.user.id)) {
                                            queueData.waitlist.delete(i.user.id);
                                            checkQueue(queueData);
                                            await i.reply({ content: 'You have been removed from the waitlist.', ephemeral: true });
                                        } else {
                                            await i.reply({ content: 'You are not in the queue.', ephemeral: true });
                                            return;
                                        }
                                    }
                                    if (i.customId === 'cancel') {
                                        if (i.user.id === queueCreator) {
                                            updateStatus(queueData, 'canceled');
                                            readyUpCollector.stop(); // Stop the collector when the queue is canceled
                                            queueData.userReadyUpTimes.clear();
                                            interaction.client.activeQueues.delete(queueKey);
                                            await i.reply({ content: `The ${queueData.name} queue for <t:${queueData.start}:t> has been canceled`, ephemeral: true });
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
                        interaction.client.activeQueues.delete(queueKey);
                    });
                } catch (error) {
                    console.error('Error handling the command:', error);
                    interaction.reply({ content: 'An error occurred while processing your request. Please try again later.', ephemeral: true });
                }
                break;
            }
            case 'kick': {
                const userToKick = interaction.options.getUser('user');
                console.log(userToKick);

                // Validate if the command issuer is the queue creator
                if (interaction.client.activeQueues.has(queueKey)) {
                    let queueData = interaction.client.activeQueues.get(queueKey);

                    // Check if user is trying to kick themselves
                    if (userToKick.id === interaction.user.id) {
                        await interaction.reply({ content: 'You may not kick yourself from your own queue.', ephemeral: true });
                        return;
                    }

                    // Check if the user is in the main queue or waitlist
                    if (queueData.mainQueue.has(userToKick.id)) {
                        if (queueData.status === 'pending') {
                            queueData.guestCount = queueData.guestCount - queueData.mainQueue.get(userToKick.id).guests;
                            queueData.mainQueue.delete(userToKick.id);
                            waitlistToQueue(queueData);
                            updateStatus(queueData, queueData.status, queueData.startTime);
                            await interaction.reply({ content: `${userToKick} has been kicked from the main queue.`, ephemeral: true });
                        } else if (queueData.status === 'readying') {
                            queueData.guestCount = queueData.guestCount - queueData.mainQueue.get(userToKick.id).guests;
                            queueData.mainQueue.delete(userToKick.id);
                            queueData.userReadyUpTimes.delete(userToKick.id);
                            waitlistToQueue(queueData);
                            checkQueue(queueData);
                            await interaction.reply({ content: `${userToKick} has been kicked from the main queue.`, ephemeral: true });
                        } else {

                        }
                    } else if (queueData.waitlist.has(userToKick.id)) {
                        if (queueData.status === 'pending') {
                            queueData.waitlist.delete(userToKick.id);
                            updateStatus(queueData, queueData.status, queueData.startTime);
                            await interaction.reply({ content: `${userToKick} has been kicked from the waitlist.`, ephemeral: true });
                        } else if (queueData.status === 'readying') {
                            queueData.waitlist.delete(userToKick.id);
                            checkQueue(queueData);
                            await interaction.reply({ content: `${userToKick} has been kicked from the waitlist.`, ephemeral: true });
                        } else {
                            
                        }
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