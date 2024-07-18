const { SlashCommandBuilder } = require('discord.js');
const mongoose = require('mongoose');
const templatesModel = require('../../models/templates');
const serverTemplatesModel = require('../../models/servertemplates');

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
                    .setAutocomplete(true)
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
                    .setAutocomplete(true)
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
                    .setAutocomplete(true)
                )
        ),
    async autocomplete(interaction) {
        // handle the autocompletion response
        const subcommand = interaction.options.getSubcommand();
        const focusedOption = interaction.options.getFocused();

        switch (subcommand) {
            case 'delete': {
                try {
                    const userId = interaction.user.id;
                    const templates = await templatesModel.find({ creatorId: userId });

                    const choices = templates.map(template => ({
                        name: `${template.name} by ${template.creatorUsername}`,
                        value: template._id.toString()
                    }));
                    const filtered = choices.filter(choice => 
                        choice.name.toLowerCase().includes(focusedOption.toLowerCase()) || 
                        choice.value.toLowerCase().includes(focusedOption.toLowerCase())
                    );
                    await interaction.respond(filtered);
                } catch (error) {
                    console.error('Error fetching templates for delete autocomplete:', error);
                    await interaction.respond([]);
                }
                break;
            }
            case 'load': {
                try {
                    const serverId = interaction.guild.id;
                    const templates = await templatesModel.find();
                    const serverTemplates = await serverTemplatesModel.find({ serverId: serverId });

                    const loadedTemplateIds = serverTemplates.map(st => st.templateId.toString());
                    const choices = templates.map(template => ({
                        name: `${loadedTemplateIds.includes(template._id.toString()) ? ' ✅' : '⬇️'} - ${template.name} by ${template.creatorUsername}`,
                        value: template._id.toString()
                    }));
                    const filtered = choices.filter(choice => 
                        choice.name.toLowerCase().includes(focusedOption.toLowerCase()) || 
                        choice.value.toLowerCase().includes(focusedOption.toLowerCase())
                    );
                    await interaction.respond(filtered);
                } catch (error) {
                    console.error('Error fetching templates for load autocomplete:', error);
                    await interaction.respond([]);
                }
                break;
            }
            case 'remove': {
                try {
                    const serverId = interaction.guild.id;
                    const serverTemplates = await serverTemplatesModel.find({ serverId: serverId }).populate('templateId');

                    const choices = serverTemplates.map(serverTemplate => ({
                        name: `✅ ${serverTemplate.templateId.name} by ${serverTemplate.templateId.creatorUsername}`,
                        value: serverTemplate.templateId._id.toString()
                    }));
                    const filtered = choices.filter(choice => 
                        choice.name.toLowerCase().includes(focusedOption.toLowerCase()) || 
                        choice.value.toLowerCase().includes(focusedOption.toLowerCase())
                    );
                    await interaction.respond(filtered);
                } catch (error) {
                    console.error('Error fetching templates for remove autocomplete:', error);
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
            case 'create': {
                const creatorId = interaction.user.id;
                const creatorUsername = interaction.user.username;
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

                try {
                    const newTemplate = await templatesModel.create({
                        creatorId: creatorId,
                        creatorUsername: creatorUsername,
                        name: name,
                        iconUrl: iconUrl,
                        queueSpots: queueSpots,
                        waitlistSpots: waitlistSpots
                    });
    
                    interaction.reply({ content: `Template created successfully!\n\nTemplate ID: ${newTemplate._id}`, ephemeral: true });
                } catch (error) {
                    console.error('Error creating template:', error);
                    interaction.reply({ content: 'An error occurred while trying to create the template. Please try again later.', ephemeral: true });
                }
                break;
            }
            case 'delete': {
                const deleteTemplateId = interaction.options.getString('template-id');

                // Validate the template ID
                if (!mongoose.Types.ObjectId.isValid(deleteTemplateId)) {
                    return interaction.reply({ content: 'Invalid template ID. Please provide a valid ID.', ephemeral: true });
                }
                
                try {
                    const template = await templatesModel.findById(deleteTemplateId);

                    // Check if template exists
                    if (!template) {
                        return interaction.reply({ content: 'Template not found. Please check the ID and try again.', ephemeral: true });
                    }

                    // Check if the user is the creator of the template
                    if (template.creatorId !== interaction.user.id) {
                        return interaction.reply({ content: 'Only the author is this template is authorized to delete it from the server it was created in.', ephemeral: true });
                    }

                    // Delete the template
                    await templatesModel.deleteOne({ _id: deleteTemplateId });

                    // Remove the template from all servers
                    await serverTemplatesModel.deleteMany({ templateId: deleteTemplateId });

                    interaction.reply({ content: 'Template deleted successfully!', ephemeral: true });
                } catch (error) {
                    console.error('Error deleting template:', error);
                    interaction.reply({ content: 'An error occurred while trying to delete the template. Please try again later.', ephemeral: true });
                }
                break;
            }
            case 'load': {
                const loadTemplateId = interaction.options.getString('template-id');

                // Validate the template ID
                if (!mongoose.Types.ObjectId.isValid(loadTemplateId)) {
                    return interaction.reply({ content: 'Invalid template ID. Please provide a valid ID.', ephemeral: true });
                }

                try {
                    const template = await templatesModel.findById(loadTemplateId);

                    // Check if template exists
                    if (!template) {
                        return interaction.reply({ content: 'Template not found. Please check the ID and try again.', ephemeral: true });
                    }

                    const serverId = interaction.guild.id;

                    // Check if the template is already loaded in the server
                    const existingEntry = await serverTemplatesModel.findOne({ serverId: serverId, templateId: loadTemplateId });
                    if (existingEntry) {
                        return interaction.reply({ content: 'This template is already loaded in this server.', ephemeral: true });
                    }

                    // Load the template into the server
                    await serverTemplatesModel.create({
                        serverId: serverId,
                        templateId: loadTemplateId
                    });

                    interaction.reply({ content: `Template with ID ${loadTemplateId} loaded successfully into this server!`, ephemeral: true });
                } catch (error) {
                    console.error('Error loading template:', error);
                    interaction.reply({ content: 'An error occurred while trying to load the template. Please try again later.', ephemeral: true });
                }
                break;
            }
            case 'remove': {
                const removeTemplateId = interaction.options.getString('template-id');

                // Validate the template ID
                if (!mongoose.Types.ObjectId.isValid(removeTemplateId)) {
                    return interaction.reply({ content: 'Invalid template ID. Please provide a valid ID.', ephemeral: true });
                }

                const serverId = interaction.guild.id;

                try {
                    const result = await serverTemplatesModel.deleteOne({ serverId: serverId, templateId: removeTemplateId });

                    if (result.deletedCount === 0) {
                        return interaction.reply({ content: 'Template not found in this server.', ephemeral: true });
                    }

                    interaction.reply({ content: `Template with ID ${removeTemplateId} removed successfully from this server!`, ephemeral: true });
                } catch (error) {
                    console.error('Error removing template:', error);
                    interaction.reply({ content: 'An error occurred while trying to remove the template. Please try again later.', ephemeral: true });
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
