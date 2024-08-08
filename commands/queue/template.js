const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const sharp = require('sharp');
const { getDownloadURL } = require('firebase-admin/storage');
const admin = require('firebase-admin');
const db = admin.firestore();
require('../../utils/messageUtils.js');

async function fetchThumbnailData(url) {
    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch thumbnail from Discord');
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Downscale the image to a maximum of 256x256 pixels
        const resizedBuffer = await sharp(buffer)
            .resize(256, 256, {
                fit: 'inside',
                withoutEnlargement: true,
            })
            .toBuffer();

        return resizedBuffer;
    } catch (error) {
        console.error('Error fetching and processing thumbnail:', error);
        throw new Error('Thumbnail processing failed.');
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('template')
        .setDescription('Create, delete, load, and remove templates.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
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
                    option.setName("thumbnail")
                    .setDescription('Thumbnail for the queue (Game art)')
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
        try {
            // handle the autocompletion response
            const subcommand = interaction.options.getSubcommand();
            const focusedOption = interaction.options.getFocused();
        
            switch (subcommand) {
                case 'delete': {
                    const userId = interaction.user.id;
                    const templatesRef = db.collection('templates').where('creatorId', '==', userId);
                    const snapshot = await templatesRef.get();

                    if (snapshot.empty) {
                        return interaction.respond([]);
                    }

                    const choices = snapshot.docs.map(doc => ({
                        name: doc.data().name,
                        value: doc.id
                    }));

                    const filtered = choices.filter(choice =>
                        choice.name.toLowerCase().includes(focusedOption.toLowerCase()) ||
                        choice.value.toLowerCase().includes(focusedOption.toLowerCase())
                    );
                    await interaction.respond(filtered);
                    break;
                }
                case 'load': {
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
                    const choices = templatesSnapshot.docs.map(doc => {
                        const template = doc.data();
                        const isLoaded = loadedTemplateIds.has(doc.id);
                        return {
                            name: `${isLoaded ? '✅' : '🚫'} - ${template.name} by ${template.creatorUsername}`,
                            value: doc.id,
                        };
                    });

                    const filtered = choices.filter(choice =>
                        choice.name.toLowerCase().includes(focusedOption.toLowerCase()) ||
                        choice.value.toLowerCase().includes(focusedOption.toLowerCase())
                    );
                
                    await interaction.respond(filtered);
                    break;
                }
                case 'remove': {
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
                    const filtered = templatesSnapshot.docs.map(doc => {
                        const template = doc.data();
                        const isLoaded = loadedTemplateIds.has(doc.id);
                        if (isLoaded) {
                            return {
                                name: `✅ - ${template.name} by ${template.creatorUsername}`,
                                value: doc.id
                            };
                        }
                    }).filter(Boolean); // Filter out undefined values

                    await interaction.respond(filtered);
                    break;
                }
                default:
                    await interaction.respond([]);
                    break;
            }
        } catch (error) {
            console.error('Error during autocomplete:', error);
            await interaction.respond(['Error fetching templates']);
        }
    },
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const storage = admin.storage().bucket();

        switch (subcommand) {
            case 'create': {
                try {
                    const name = interaction.options.getString('name');
                    const thumbnailAttach = interaction.options.getAttachment('thumbnail');
                    const mainMax = interaction.options.getInteger('queue-spots');
                    const waitlistMax = interaction.options.getInteger('waitlist-spots');
            
                    // Verify thumbnail type
                    if (mainMax < 1 || waitlistMax < 0 || !['image/png', 'image/jpeg'].includes(thumbnailAttach.contentType)) {
                        return interaction.qReply({
                            content: 'Invalid input data. Ensure all fields are correctly filled and the image is in PNG or JPEG format.',
                            type: 'warning'
                        });
                    }
            
                    // Manually generate a new ID for the template
                    const newTemplateId = db.collection('templates').doc().id;

                    // Store thumbnail
                    const thumbnailRef = storage.file(`thumbnails/${newTemplateId}`);
                    const buffer = await fetchThumbnailData(thumbnailAttach.url);
                    await thumbnailRef.save(buffer, {
                        metadata: {
                            contentType: thumbnailAttach.contentType,
                        }
                    });
            
                    // Get thumbnail URL
                    const thumbnail = await getDownloadURL(thumbnailRef);
            
                    await db.collection('templates').doc(newTemplateId).set({
                        creatorId: interaction.user.id,
                        creatorUsername: interaction.user.username,
                        name,
                        thumbnail,
                        mainMax,
                        waitlistMax,
                        createdAt: admin.firestore.Timestamp.now()
                    });
            
                    await interaction.qReply({ 
                        content: `${name} created successfully!`, 
                        type: 'success'
                    });
                } catch (error) {
                    console.error('Error during the create process:', error);
                    await interaction.qReply({ 
                        content: 'Failed to create template. Please try again.', 
                        type: 'error'
                    });
                }
                break;
            }
            case 'delete': {
                try {
                    const templateId = interaction.options.getString('template-id');
                    const templateDocRef = db.collection('templates').doc(templateId);
            
                    const templateDoc = await templateDocRef.get();
                    if (!templateDoc.exists) {
                        return interaction.qReply({ 
                            content: 'Template not found.', 
                            type: 'warning'
                        });
                    }
            
                    const templateData = templateDoc.data();
            
                    if (templateData.creatorId !== interaction.user.id) {
                        return interaction.qReply({ 
                            content: 'You are not authorized to delete this template.', 
                            type: 'warning'
                        });
                    }
            
                    // Reference to the image with the same ID
                    const thumbnailRef = storage.file(`thumbnails/${templateId}`);
            
                    // Delete the image
                    await thumbnailRef.delete();
            
                    // Delete the template document
                    await templateDocRef.delete();
            
                    await interaction.qReply({ 
                        content: `${templateData.name} deleted successfully.`, 
                        type: 'success'
                    });
                } catch (error) {
                    console.error('Error deleting template:', error);
                    await interaction.qReply({ 
                        content: 'An error occurred while trying to delete the template. Please try again later.', 
                        type: 'error'
                    });
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
                        return interaction.qReply({ 
                            content: 'Template does not exist.', 
                            type: 'warning'
                        });
                    }
            
                    const templateData = templateDoc.data();

                    // Check if the template is already loaded in this server
                    const querySnapshot = await serverTemplatesRef.where('serverId', '==', serverId).where('templateId', '==', templateId).get();
                    if (!querySnapshot.empty) {
                        return interaction.qReply({ 
                            content: `${templateData.name} is already loaded into this server.`, 
                            type: 'warning'
                        });
                    }
            
                    // Add the template to the serverTemplates collection for this server
                    await serverTemplatesRef.add({
                        serverId: serverId,
                        templateId: templateId
                    });
            
                    await interaction.qReply({ 
                        content: `${templateData.name} was loaded into this server by ${interaction.user}.`, 
                        type: 'info',
                        ephemeral: false 
                    });
                } catch (error) {
                    console.error('Error loading template:', error);
                    await interaction.qReply({ 
                        content: 'An error occurred while trying to load the template. Please try again later.', 
                        type: 'error'
                    });
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
                        return interaction.qReply({ 
                            content: 'Template does not exist.', 
                            type: 'warning'
                        });
                    }

                    const templateData = templateDoc.data();

                    // Check if the template is loaded in this server
                    const querySnapshot = await serverTemplatesRef.get();
                    if (querySnapshot.empty) {
                        return interaction.qReply({ 
                            content: `${templateData.name} is not loaded into this server.`, 
                            type: 'warning'
                        });
                    }

                    // Remove the template from the server
                    querySnapshot.forEach(doc => {
                        doc.ref.delete();
                    });

                    await interaction.qReply({ 
                        content: `${templateData.name} was removed from this server by ${interaction.user}.`, 
                        type: 'info',
                        ephemeral: false 
                    });
                } catch (error) {
                    console.error('Error removing template:', error);
                    interaction.qReply({ 
                        content: 'An error occurred while trying to remove the template. Please try again later.', 
                        type: 'error',
                    });
                }
                break;
            }
            default: {
                interaction.qReply({ 
                    content: 'Unknown subcommand', 
                    type: 'warning',
                });
                break;
            }
        }
    },
};
