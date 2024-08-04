const { ChatInputCommandInteraction, MessageContextMenuCommandInteraction, UserContextMenuCommandInteraction, ButtonInteraction, ModalSubmitInteraction, User, TextChannel } = require('discord.js');
const { EmbedBuilder } = require('discord.js');

const colors = {
    info: 0x7D50A0,    // Purple
    success: 0x297F48, // Green
    error: 0xD83941,   // Red
    warning: 0xEFB141  // Yellow
};

const titles = {
    info: 'Info:',       // Purple
    success: 'Success:', // Green
    error: 'Error:',     // Red
    warning: 'Warning:'  // Blue
};

function qReply(options) {
    if (!options || !options.content) {
        throw new Error("embedReply: 'content' is required");
    }
    const { content, type = 'info', ephemeral = true } = options;
    const embed = new EmbedBuilder()
        .setTitle(titles[type])
        .setDescription(content)
        .setColor(colors[type]);

    return this.reply({
        embeds: [embed],
        ephemeral: ephemeral
    });
}

[ChatInputCommandInteraction, MessageContextMenuCommandInteraction, UserContextMenuCommandInteraction, ButtonInteraction, ModalSubmitInteraction].forEach(interactionType => {
    interactionType.prototype.qReply = qReply;
});

function qSend(options) {
    if (!options || !options.content) {
        throw new Error("qSend: 'content' is required");
    }
    const { content, type = 'info', thumbnail } = options;
    const embed = new EmbedBuilder()
        .setTitle(titles[type])
        .setDescription(content)
        .setColor(colors[type]);

    if(thumbnail) embed.setThumbnail(thumbnail);

    return this.send({ embeds: [embed] });
}

[User, TextChannel].forEach(loc => {
    loc.prototype.qSend = qSend;
});

module.exports = {
    ChatInputCommandInteraction, 
    MessageContextMenuCommandInteraction, 
    UserContextMenuCommandInteraction, 
    ButtonInteraction, 
    ModalSubmitInteraction
};