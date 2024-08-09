const { SlashCommandBuilder } = require('discord.js');
const { timezones } = require('../../utils/timezones');
const moment = require('moment-timezone');
const admin = require('firebase-admin');
const db = admin.firestore();
const Queue = require('../../classes/Queue.js');
require('../../utils/messageUtils.js');

// Function to parse the provided time input into a valid time object in the specified timezone
function parseTime(input, timezone) {
    const formats = ['h:mm A', 'h:mmA', 'h A', 'hA', 'H', 'H:mm'];
    let parsedTime = moment.tz(input, formats, timezone);

    if (!parsedTime.isValid()) {
        throw new Error('Invalid time format.');
    }

    const currentTime = moment().tz(timezone);
    parsedTime.date(currentTime.date());

    if (parsedTime.isBefore(currentTime)) {
        parsedTime.add(1, 'days');
    }

    return parsedTime.unix(); 
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
        try {
            const subcommand = interaction.options.getSubcommand();
            const focusedOption = interaction.options.getFocused();

            let choices = [];

            switch (subcommand) {
                case 'new': {
                    const serverId = interaction.guild.id;
                    const templatesRef = db.collection('templates');
                    const serverTemplatesRef = db.collection('serverTemplates').where('serverId', '==', serverId);
                    const [templatesSnapshot, serverTemplatesSnapshot] = await Promise.all([
                        templatesRef.get(),
                        serverTemplatesRef.get()
                    ]);

                    if (templatesSnapshot.empty) {
                        return interaction.respond([]);
                    }

                    const loadedTemplateIds = new Set(serverTemplatesSnapshot.docs.map(doc => doc.data().templateId));
                    choices = templatesSnapshot.docs.map(doc => {
                        const template = doc.data();
                        const isLoaded = loadedTemplateIds.has(doc.id);
                        return isLoaded ? { name: `${template.name} by ${template.creatorUsername}`, value: doc.id } : null;
                    }).filter(choice => choice); // Filter out any null or undefined values
                    break;
                }
                default:
                    await interaction.respond([]);
                    return;
            }

            // Filter and limit the choices to 25 max
            const filtered = choices.filter(choice =>
                choice.name.toLowerCase().includes(focusedOption.toLowerCase()) ||
                choice.value.toLowerCase().includes(focusedOption.toLowerCase())
            ).slice(0, 25); // Limit to 25 choices

            await interaction.respond(filtered);
        } catch (error) {
            console.error('Error during autocomplete:', error);
            await interaction.respond([{ name: 'Error fetching templates', value: 'error' }]);
        }
    },
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const queueKey = `${interaction.user.id}-${interaction.guild.id}`;

        switch (subcommand) {
            case 'new':
            case 'manual': {
                try {
                    if (interaction.client.activeQueues.has(queueKey)) {
                        return interaction.qReply({
                            content: 'You may only have one active queue per server.', 
                            type: 'warning'
                        });
                    }

                    const timeInput = interaction.options.getString('time');
                    const timezone = interaction.options.getString('timezone');
                    const start = parseTime(timeInput, timezone);

                    if (!start) {
                        return interaction.qReply({ 
                            content: 'Please use a valid time format e.g. "11:30 PM".', 
                            type: 'warning'
                        });
                    }

                    let options = {
                        creator: {
                            id: interaction.user.id,
                            name: interaction.user.username,
                            avatar: interaction.user.displayAvatarURL()
                        },
                        start: start,
                        timezone: timezone
                    };

                    if (subcommand === 'new') {
                        const templateId = interaction.options.getString('template-id');
                        const serverId = interaction.guild.id;
            
                        const templateDocRef = db.collection('templates').doc(templateId);
                        const serverTemplatesRef = db.collection('serverTemplates');
                        const serverTemplateQuery = serverTemplatesRef.where('serverId', '==', serverId).where('templateId', '==', templateId);

                        try {
                            const templateDoc = await templateDocRef.get();
                            const serverTemplateSnapshot = await serverTemplateQuery.get();

                            if (!templateDoc.exists) {
                                return interaction.qReply({ 
                                    content: 'Template does not exist. Please check the ID and try again.', 
                                    type: 'warning'
                                });
                            }

                            if (serverTemplateSnapshot.empty) {
                                return interaction.qReply({ 
                                    content: 'Template is not loaded in this server. Please load the template first.', 
                                    type: 'warning'
                                });
                            }
            
                            const templateData = templateDoc.data();
                            options.name = templateData.name;
                            options.thumbnail = templateData.thumbnail;
                            options.mainMax = templateData.mainMax;
                            options.waitlistMax = templateData.waitlistMax;
                        } catch (error) {
                            console.error('Error fetching template:', error);
                            return interaction.qReply({ 
                                content: 'An error occurred while fetching the template. Please try again later.', 
                                type: 'error' 
                            });
                        }
                    } else {
                        options.name = interaction.options.getString('name');
                        options.thumbnail = 'https://i.imgur.com/j1LmKzM.png';
                        options.mainMax = interaction.options.getInteger('queue-spots');
                        options.waitlistMax = interaction.options.getInteger('waitlist-spots');
                    }
            
                    if (options.mainMax < 1 || options.mainMax > 100) {
                        return interaction.qReply({ 
                            content: 'Please input a valid number of queue spots (1-100).', 
                            type: 'warning'
                        });
                    }
            
                    if (options.waitlistMax < 0 || options.waitlistMax > 50) {
                        return interaction.qReply({ 
                            content: 'Please input a valid number of waitlist spots (0-50).', 
                            type: 'warning' 
                        });
                    }
            
                    const queue = new Queue(queueKey, options);
                    await queue.sendResponse(interaction);

                    interaction.client.activeQueues.set(queueKey, queue);

                } catch (error) {
                    console.error('Error handling the command:', error);
                    interaction.qReply({ 
                        content: 'An error occurred while processing your request. Please try again later.', 
                        type: 'error'
                    });
                }
                break;
            }
            case 'kick': {
                try {
                    const userToKick = interaction.options.getUser('user');

                    if (interaction.client.activeQueues.has(queueKey)) {
                        const queue = interaction.client.activeQueues.get(queueKey);

                        if (userToKick.id === interaction.user.id) {
                            await interaction.qReply({ 
                                content: 'You may not kick yourself from your own queue.', 
                                type: 'warning'
                            });
                        } else if (queue.main.has(userToKick.id)) {
                            await queue.removeMain(userToKick);
                            await queue.fillMain();
                            await queue.updateResponse();
                            await interaction.qReply({ 
                                content: `${userToKick} has been removed from ${queue.name} queue for <t:${queue.start}:t>.`, 
                                type: 'info',
                                ephemeral: false
                            });
                        } else if (queue.waitlist.has(userToKick.id)) {
                            await queue.removeWaitlist(userToKick);
                            await queue.updateResponse();
                            await interaction.qReply({ 
                                content: `${userToKick} has been removed from the waitlist.`, 
                                type: 'info',
                                ephemeral: false
                            });
                        } else {
                            await interaction.qReply({ 
                                content: `${userToKick} is not in the queue or waitlist.`, 
                                type: 'warning'
                            });
                        }
                    } else {
                        await interaction.qReply({ 
                            content: 'You do not have an active queue to kick users from.', 
                            type: 'warning'
                        });
                    }
                } catch (error) {
                    console.error('Error handling kick command:', error);
                    interaction.qReply({ 
                        content: 'An error occurred while processing your request. Please try again later.', 
                        type: 'error'
                    });
                }
                break;
            }
            default: {
                await interaction.qReply({ 
                    content: 'Unknown subcommand', 
                    type: 'warning'
                });
                break;
            }
        }
    },
};
