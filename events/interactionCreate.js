const { Collection, Events } = require('discord.js');

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (!interaction.client.loadedData) {
			return interaction.qReply({
				content: 'QBot is still loading data, please try again in a moment.',
				type: 'warning'
			});
		}

		if (interaction.isChatInputCommand()) {
			const command = interaction.client.commands.get(interaction.commandName);

			if (!command) {
				console.error(`No command matching ${interaction.commandName} was found.`);
				return;
			}

			// Check if the command is 'error' and bypass the usual checks
			if (interaction.commandName === 'error') {
				await command.execute(interaction);
				return;
			}
			
			// Cooldowns
			const { cooldowns } = interaction.client;

			if (!cooldowns.has(command.data.name)) {
				cooldowns.set(command.data.name, new Collection());
			}

			const now = Date.now();
			const timestamps = cooldowns.get(command.data.name);
			const defaultCooldownDuration = 3;
			const cooldownAmount = (command.cooldown ?? defaultCooldownDuration) * 1_000;

			if (timestamps.has(interaction.user.id)) {
				const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;

				if (now < expirationTime) {
					const expiredTimestamp = Math.round(expirationTime / 1_000);
					return interaction.qReply({ 
						content: `Please wait, you are on a cooldown for \`${command.data.name}\`. You can use it again <t:${expiredTimestamp}:R>.`, 
						type: 'warning' 
					});
				}
			}

			timestamps.set(interaction.user.id, now);
			setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

			try {
				await command.execute(interaction);
			} catch (error) {
				console.error(error);
				if (interaction.replied || interaction.deferred) {
					await interaction.qFollowUp({ 
						content: 'There was an error while executing this command!', 
						type: 'error'
					});
				} else {
					await interaction.qReply({ 
						content: 'There was an error while executing this command!', 
						type: 'error' 
					});
				}
			}
		} else if (interaction.isAutocomplete()) {
			const command = interaction.client.commands.get(interaction.commandName);

			if (!command) {
				console.error(`No command matching ${interaction.commandName} was found.`);
				return;
			}
	
			try {
				await command.autocomplete(interaction);
			} catch (error) {
				console.error(error);
			}
		}
		return;
	},
};