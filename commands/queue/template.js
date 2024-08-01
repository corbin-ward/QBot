const { SlashCommandBuilder } = require('discord.js');
const { getDownloadURL } = require('firebase-admin/storage');
var admin = require('firebase-admin');

async function fetchIconData(url) {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Failed to fetch icon from Discord');
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

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
        const db = admin.firestore();
    
        switch (subcommand) {
            case 'delete': {
                try {
                    const userId = interaction.user.id;
                    const templatesRef = db.collection('templates').where('creatorId', '==', userId);
                    const snapshot = await templatesRef.get();

                    const choices = [];
                    snapshot.forEach(doc => {
                        const template = doc.data();
                        choices.push({
                            name: `${template.name} by ${template.creatorUsername}`,
                            value: doc.id
                        });
                    });

                    const filtered = choices.filter(choice =>
                        choice.name.toLowerCase().includes(focusedOption.toLowerCase()) ||
                        choice.name.toLowerCase().includes(focusedOption.toLowerCase())
                    );
                    await interaction.respond(filtered);
                } catch (error) {
                    console.error('Error fetching templates for delete autocomplete:', error);
                    await interaction.respond(['Error fetching templates']);
                }
                break;
            }
            case 'load': {
                try {
                    const serverId = interaction.guild.id;
                    const templatesRef = db.collection('templates');
                    const serverTemplatesRef = db.collection('serverTemplates').where('serverId', '==', serverId);
                    const [templatesSnapshot, serverTemplatesSnapshot] = await Promise.all([
                        templatesRef.get(),
                        serverTemplatesRef.get()
                    ]);
            
                    const loadedTemplateIds = new Set(serverTemplatesSnapshot.docs.map(doc => doc.data().templateId));
                    const choices = templatesSnapshot.docs.map(doc => {
                        const template = doc.data();
                        const isLoaded = loadedTemplateIds.has(doc.id);
                        // Conditionally format the name based on loaded status
                        return {
                            name: `${isLoaded ? '✅' : '🚫'} - ${template.name} by ${template.creatorUsername}`,
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
            case 'remove': {
                try {
                    const serverId = interaction.guild.id;
                    const templatesRef = db.collection('templates');
                    const serverTemplatesRef = db.collection('serverTemplates').where('serverId', '==', serverId);
                    const [templatesSnapshot, serverTemplatesSnapshot] = await Promise.all([
                        templatesRef.get(),
                        serverTemplatesRef.get()
                    ]);

                    const loadedTemplateIds = new Set(serverTemplatesSnapshot.docs.map(doc => doc.data().templateId));
                    const filtered = templatesSnapshot.docs.map(doc => {
                        const template = doc.data();
                        const isLoaded = loadedTemplateIds.has(doc.id);
                        if (isLoaded) { // Only include loaded templates
                            return { name: `✅ - ${template.name} by ${template.creatorUsername}`, value: doc.id };
                        }
                    }).filter(choice => choice && ( // Ensure the choice exists and filter based on name or ID
                        choice.name.toLowerCase().includes(focusedOption) ||
                        choice.value.toLowerCase().includes(focusedOption)
                    ));

                    await interaction.respond(filtered);
                } catch (error) {
                    console.error('Error fetching templates for remove:', error);
                    await interaction.respond(['Error fetching templates']);
                }
                break;
            }
            default:
                await interaction.respond([]);
                break;
        }
    },
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const db = admin.firestore();
        const storage = admin.storage().bucket();

        switch (subcommand) {
            case 'create': {
                try {
                    const name = interaction.options.getString('name');
                    const icon = interaction.options.getAttachment('icon');
                    const queueSpots = interaction.options.getInteger('queue-spots');
                    const waitlistSpots = interaction.options.getInteger('waitlist-spots');
            
                    if (queueSpots < 1 || waitlistSpots < 0 || !['image/png', 'image/jpeg'].includes(icon.contentType)) {
                        return interaction.reply({
                            content: 'Invalid input data. Ensure all fields are correctly filled and the image is in PNG or JPEG format.',
                            ephemeral: true
                        });
                    }
            
                    // Manually generate a new ID for the template
                    const newTemplateId = db.collection('templates').doc().id;

                    const iconRef = storage.file(`icons/${newTemplateId}`);
                    const buffer = await fetchIconData(icon.url);
            
                    await iconRef.save(buffer, {
                        metadata: {
                            contentType: icon.contentType,
                        }
                    });
            
                    const iconUrl = await getDownloadURL(iconRef);
            
                    await db.collection('templates').doc(newTemplateId).set({
                        creatorId: interaction.user.id,
                        creatorUsername: interaction.user.username,
                        name,
                        iconUrl,
                        queueSpots,
                        waitlistSpots,
                        createdAt: admin.firestore.Timestamp.now()
                    });
            
                    await interaction.reply({ content: 'Template created successfully!', ephemeral: true });
                } catch (error) {
                    console.error('Error during the create process:', error);
                    await interaction.reply({ content: 'Failed to create template. Please try again.', ephemeral: true });
                }
                break;
            }
            case 'delete': {
                try {
                    const templateId = interaction.options.getString('template-id');
                    const templateDocRef = db.collection('templates').doc(templateId);
            
                    const templateDoc = await templateDocRef.get();
                    if (!templateDoc.exists) {
                        await interaction.reply({ content: 'Template not found.', ephemeral: true });
                        return;
                    }
            
                    const templateData = templateDoc.data();
            
                    if (templateData.creatorId !== interaction.user.id) {
                        await interaction.reply({ content: 'You are not authorized to delete this template.', ephemeral: true });
                        return;
                    }
            
                    // Reference to the image with the same ID
                    const iconRef = storage.file(`icons/${templateId}`);
            
                    // Delete the image
                    await iconRef.delete();
            
                    // Delete the template document
                    await templateDocRef.delete();
            
                    await interaction.reply({ content: 'Template deleted successfully.', ephemeral: true });
                } catch (error) {
                    console.error('Error deleting template:', error);
                    await interaction.reply({ content: 'An error occurred while trying to delete the template. Please try again later.', ephemeral: true });
                }
                break;
            }
            case 'load': {
                try {
                    const templateId = interaction.options.getString('template-id');
                    const serverId = interaction.guild.id; // Get the server ID from the guild object of the interaction
                    const templatesRef = db.collection('templates').doc(templateId);
                    const serverTemplatesRef = db.collection('serverTemplates');
            
                    // Check if the template exists
                    const templateDoc = await templatesRef.get();
                    if (!templateDoc.exists) {
                        await interaction.reply({ content: 'Template does not exist.', ephemeral: true });
                        return;
                    }
            
                    // Check if the template is already loaded in this server
                    const querySnapshot = await serverTemplatesRef.where('serverId', '==', serverId).where('templateId', '==', templateId).get();
                    if (!querySnapshot.empty) {
                        await interaction.reply({ content: 'This template is already loaded in this server.', ephemeral: true });
                        return;
                    }
            
                    // Add the template to the serverTemplates collection for this server
                    await serverTemplatesRef.add({
                        serverId: serverId,
                        templateId: templateId
                    });
            
                    await interaction.reply({ content: `Template ${templateId} loaded successfully into this server!`, ephemeral: true });
                } catch (error) {
                    console.error('Error loading template:', error);
                    await interaction.reply({ content: 'An error occurred while trying to load the template. Please try again later.', ephemeral: true });
                }
                break;
            }
            case 'remove': {
                try {
                    const templateId = interaction.options.getString('template-id');
                    const serverId = interaction.guild.id; // Assumes the command is used within a guild

                    // Reference to the main templates collection and server-specific templates
                    const templatesRef = db.collection('templates').doc(templateId);
                    const serverTemplatesRef = db.collection('serverTemplates')
                        .where('serverId', '==', serverId)
                        .where('templateId', '==', templateId);

                    // Check if the template exists globally
                    const templateDoc = await templatesRef.get();
                    if (!templateDoc.exists) {
                        await interaction.reply({ content: 'Template does not exist.', ephemeral: true });
                        return;
                    }

                    // Check if the template is loaded in this server
                    const querySnapshot = await serverTemplatesRef.get();
                    if (querySnapshot.empty) {
                        await interaction.reply({ content: 'This template is not loaded in this server.', ephemeral: true });
                        return;
                    }

                    // Remove the template from the server
                    querySnapshot.forEach(doc => {
                        doc.ref.delete();
                    });

                    await interaction.reply({ content: `Template ${templateId} removed successfully from this server!`, ephemeral: true });
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
