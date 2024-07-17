const { SlashCommandBuilder } = require('discord.js');
const templatesModel = require('../../models/templates');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('template')
        .setDescription('Create, delete, load, and remove templates.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Creates a new template that can be used in any server with QBot.')
                .addStringOption(option => 
                    option.setName('name')
                    .setDescription('Name of the queue (Game name)')
                    .setRequired(true)
                )
                .addAttachmentOption(option => 
                    option.setName("icon")
                    .setDescription('Icon for the queue (Game art)')
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
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Deletes any template you have created from every server with QBot.')
                .addStringOption(option =>
                    option.setName('template-id')
                    .setDescription('ID of the template to delete')
                    .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('load')
                .setDescription('Loads any template into this server.')
                .addStringOption(option =>
                    option.setName('template-id')
                    .setDescription('ID of the template to load')
                    .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Removes any template from this server.')
                .addStringOption(option =>
                    option.setName('template-id')
                    .setDescription('ID of the template to remove')
                    .setRequired(true)
                )
        ),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'create': {
                const creatorId = interaction.user.id;
                const name = interaction.options.getString('name');
                const icon = interaction.options.getAttachment('icon');

                // Validate icon
                const validTypes = ['image/png', 'image/jpeg'];
                if (!validTypes.includes(icon.contentType)) {
                    return interaction.reply({ content: 'Invalid icon type. Please upload a PNG or JPEG image.', ephemeral: true });
                }

                // Get icon url
                const iconUrl = icon.url;

                const queueSpots = interaction.options.getInteger('queue-spots');
                // Validate queue spots
                if (queueSpots < 1) {
                    return interaction.reply({ content: 'Please input a valid number of main queue spots (at least 1).', ephemeral: true });
                } else if (queueSpots > 100) {
                    return interaction.reply({ content: 'Please input a valid number of main queue spots (at most 100).', ephemeral: true });
                }

                const waitlistSpots = interaction.options.getInteger('waitlist-spots');

                // Validate waitlist spots
                if (waitlistSpots < 0) {
                    return interaction.reply({ content: 'Please input a valid number of waitlist spots (at least 0).', ephemeral: true });
                } else if (waitlistSpots > 50) {
                    return interaction.reply({ content: 'Please input a valid number of waitlist spots (at most 50).', ephemeral: true });
                }

                await templatesModel.create({
                    creatorId: creatorId,
                    name: name,
                    iconUrl: iconUrl,
                    queueSpots: queueSpots,
                    waitlistSpots: waitlistSpots
                });

                interaction.reply({ content: 'Template created successfully!', ephemeral: true });
                break;
            }
            case 'delete': {
                const deleteTemplateId = interaction.options.getString('template-id');
                
                // Your delete logic here
                await templatesModel.deleteOne({ _id: deleteTemplateId, creatorId: interaction.user.id });

                interaction.reply({ content: 'Template deleted successfully!', ephemeral: true });
                break;
            }
            case 'load': {
                const loadTemplateId = interaction.options.getString('template-id');
                
                // Your load logic here
                // This could be fetching the template and adding it to the current server's configuration

                interaction.reply({ content: `Template with ID ${loadTemplateId} loaded successfully!`, ephemeral: true });
                break;
            }
            case 'remove': {
                const removeTemplateId = interaction.options.getString('template-id');
                
                // Your remove logic here
                // This could be removing the template from the current server's configuration

                interaction.reply({ content: `Template with ID ${removeTemplateId} removed successfully!`, ephemeral: true });
                break;
            }
            default: {
                interaction.reply({ content: 'Unknown subcommand', ephemeral: true });
                break;
            }
        }
    },
};
