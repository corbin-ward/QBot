const { SlashCommandBuilder } = require('discord.js');
const { getFirestore, collection, addDoc, doc, deleteDoc, getDocs, query, where, getDoc } = require('firebase/firestore');
const { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } = require('firebase/storage');

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
        const db = getFirestore();
    
        switch (subcommand) {
            case 'delete': {
                try {
                    const userId = interaction.user.id;
                    const templatesCol = collection(db, 'templates');
                    const q = query(templatesCol, where('creatorId', '==', userId));
                    const querySnapshot = await getDocs(q);
    
                    const choices = [];
                    querySnapshot.forEach(doc => {
                        const template = doc.data();
                        choices.push({
                            name: `${template.name} by ${template.creatorUsername}`,
                            value: doc.id
                        });
                    });
    
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
                    const templatesCol = collection(db, 'templates');
                    const serverTemplatesCol = collection(db, 'serverTemplates');
                    const serverTemplatesQuery = query(serverTemplatesCol, where('serverId', '==', serverId));
                    const serverTemplatesSnapshot = await getDocs(serverTemplatesQuery);
                    const loadedTemplateIds = serverTemplatesSnapshot.docs.map(doc => doc.data().templateId);
    
                    const querySnapshot = await getDocs(templatesCol);
                    const choices = querySnapshot.docs.map(doc => ({
                        name: `${loadedTemplateIds.includes(doc.id) ? '✅' : '🚫'} - ${doc.data().name} by ${doc.data().creatorUsername}`,
                        value: doc.id
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
                                name: `✅ ${templateDoc.data().name} by ${templateDoc.data().creatorUsername}`,
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
                    console.error('Error fetching templates for remove autocomplete:', error);
                    await interaction.respond([]);
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
        const db = getFirestore();
        const storage = getStorage();

        switch (subcommand) {
            case 'create': {
                const name = interaction.options.getString('name');
                const icon = interaction.options.getAttachment('icon');
                const queueSpots = interaction.options.getInteger('queue-spots');
                const waitlistSpots = interaction.options.getInteger('waitlist-spots');
                const iconRef = ref(storage, `icons/${icon.id}`);

                // Validate input
                if (queueSpots < 1 || waitlistSpots < 0 || !['image/png', 'image/jpeg'].includes(icon.contentType)) {
                    return interaction.reply({
                        content: 'Invalid input data. Ensure all fields are correctly filled and the image is in PNG or JPEG format.',
                        ephemeral: true
                    });
                }

                // Upload icon to Firebase Storage
                const iconBuffer = Buffer.from(await (await fetch(icon.url)).arrayBuffer());
                const metadata = {
                    contentType: icon.contentType,
                };

                try {
                    await uploadBytes(iconRef, iconBuffer, metadata);
                    const iconUrl = await getDownloadURL(iconRef);

                    // Create a new document in Firestore
                    const docRef = await addDoc(collection(db, 'templates'), {
                        creatorId: interaction.user.id,
                        creatorUsername: interaction.user.username,
                        name,
                        iconUrl,
                        queueSpots,
                        waitlistSpots,
                    });

                    interaction.reply({ content: `Template created successfully with ID: ${docRef.id}`, ephemeral: true });
                } catch (error) {
                    console.error('Error creating template:', error);
                    interaction.reply({ content: 'Failed to create template. Please try again.', ephemeral: true });
                }
                break;
            }
            case 'delete': {
                const deleteTemplateId = interaction.options.getString('template-id');
                const templateDocRef = doc(db, 'templates', deleteTemplateId);

                try {
                    // Check if the user is the creator of the template
                    const templateDoc = await getDoc(templateDocRef);
                    if (!templateDoc.exists()) {
                        return interaction.reply({ content: 'Template not found. Please check the ID and try again.', ephemeral: true });
                    }

                    if (templateDoc.data().creatorId !== interaction.user.id) {
                        return interaction.reply({ content: 'Only the author of this template is authorized to delete it.', ephemeral: true });
                    }

                    // Retrieve the image reference and delete the image from storage
                    const iconUrl = templateDoc.data().iconUrl;
                    const iconRef = ref(storage, iconUrl);

                    await deleteObject(iconRef).catch(error => {
                        console.error('Error deleting image from storage:', error);
                        throw new Error('Failed to delete image associated with the template.');
                    });

                    // Delete the template document
                    await deleteDoc(templateDocRef);
                    interaction.reply({ content: 'Template deleted successfully!', ephemeral: true });
                } catch (error) {
                    console.error('Error deleting template:', error);
                    interaction.reply({ content: 'An error occurred while trying to delete the template. Please try again later.', ephemeral: true });
                }
                break;
            }
            case 'load': {
                const loadTemplateId = interaction.options.getString('template-id');
                const serverId = interaction.guild.id;
                const serverTemplateCol = collection(db, 'serverTemplates');
                const templateDocRef = doc(db, 'templates', loadTemplateId);

                try {
                    const templateDoc = await getDoc(templateDocRef);
                    if (!templateDoc.exists()) {
                        return interaction.reply({ content: 'Template not found. Please check the ID and try again.', ephemeral: true });
                    }

                    const q = query(serverTemplateCol, where('serverId', '==', serverId), where('templateId', '==', loadTemplateId));
                    const querySnapshot = await getDocs(q);

                    if (!querySnapshot.empty) {
                        return interaction.reply({ content: 'This template is already loaded in this server.', ephemeral: true });
                    }

                    await addDoc(serverTemplateCol, {
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
                const serverId = interaction.guild.id;
                const serverTemplateCol = collection(db, 'serverTemplates');

                try {
                    const q = query(serverTemplateCol, where('serverId', '==', serverId), where('templateId', '==', removeTemplateId));
                    const querySnapshot = await getDocs(q);

                    if (querySnapshot.empty) {
                        return interaction.reply({ content: 'Template not found in this server.', ephemeral: true });
                    }

                    querySnapshot.forEach(async (doc) => {
                        await deleteDoc(doc.ref);
                    });

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
