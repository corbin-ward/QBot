const { 
    ChatInputCommandInteraction, 
    MessageContextMenuCommandInteraction, 
    UserContextMenuCommandInteraction, 
    ButtonInteraction, 
    ModalSubmitInteraction, 
    User, 
    TextChannel, 
    Message 
} = require('discord.js');
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
    warning: 'Warning:'  // Yellow
};

function qReply(options) {
    try {
        if (!options || !options.content) {
            throw new Error("qReply: 'content' is required");
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
    } catch (error) {
        console.error('Error in qReply:', error);
    }
}

[ChatInputCommandInteraction, MessageContextMenuCommandInteraction, UserContextMenuCommandInteraction, ButtonInteraction, ModalSubmitInteraction].forEach(interactionType => {
    interactionType.prototype.qReply = qReply;
});

function qFollowUp(options) {
    try {
        if (!options || !options.content) {
            throw new Error("qFollowUp: 'content' is required");
        }
        const { content, type = 'info', ephemeral = true } = options;
        const embed = new EmbedBuilder()
            .setTitle(titles[type])
            .setDescription(content)
            .setColor(colors[type]);

        return this.followUp({
            embeds: [embed],
            ephemeral: ephemeral
        });
    } catch (error) {
        console.error('Error in qFollowUp:', error);
    }
}

[ChatInputCommandInteraction, MessageContextMenuCommandInteraction, UserContextMenuCommandInteraction, ButtonInteraction, ModalSubmitInteraction].forEach(interactionType => {
    interactionType.prototype.qFollowUp = qFollowUp;
});

function qSend(options) {
    try {
        if (!options || !options.content) {
            throw new Error("qSend: 'content' is required");
        }
        const { content, type = 'info', thumbnail } = options;
        const embed = new EmbedBuilder()
            .setTitle(titles[type])
            .setDescription(content)
            .setColor(colors[type]);

        if (thumbnail) embed.setThumbnail(thumbnail);

        return this.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error in qSend:', error);
    }
}

[User, TextChannel].forEach(loc => {
    loc.prototype.qSend = qSend;
});

function qEdit(options) {
    try {
        const embed = this.embeds[0] ? EmbedBuilder.from(this.embeds[0]) : new EmbedBuilder();
        const { content, type, thumbnail } = options;

        if (type) {
            embed
                .setTitle(titles[type])
                .setColor(colors[type]);
        }
        if (content) embed.setDescription(content);
        if (thumbnail) embed.setThumbnail(thumbnail);

        return this.edit({ embeds: [embed] });
    } catch (error) {
        console.error('Error in qEdit:', error);
    }
}

[Message].forEach(loc => {
    loc.prototype.qEdit = qEdit;
});

module.exports = {
    ChatInputCommandInteraction, 
    MessageContextMenuCommandInteraction, 
    UserContextMenuCommandInteraction, 
    ButtonInteraction, 
    ModalSubmitInteraction
};