const {
	ContextMenuCommandBuilder,
	ApplicationCommandType,
	EmbedBuilder,
	ModalBuilder,
	ActionRowBuilder,
	TextInputBuilder,
	TextInputStyle,
	PermissionFlagsBits,
	MessageFlags,
} = require("discord.js");

module.exports = {
	data: new ContextMenuCommandBuilder()
		.setName("Edit Embed")
		.setType(ApplicationCommandType.Message)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

	async execute(interaction) {
		const message = interaction.targetMessage;
		const embed = message.embeds[0];

		if (embed == undefined) {
			return await interaction.reply({
				content: "No embed found.",
				flags: MessageFlags.Ephemeral,
			});
		}

		const fields = {
			title: new TextInputBuilder()
				.setCustomId("title")
				.setStyle(TextInputStyle.Short)
				.setLabel("Title")
				.setRequired(false),
			description: new TextInputBuilder()
				.setCustomId("description")
				.setStyle(TextInputStyle.Paragraph)
				.setLabel("Description")
				.setRequired(false),
			image: new TextInputBuilder()
				.setCustomId("image")
				.setStyle(TextInputStyle.Short)
				.setLabel("Image")
				.setRequired(false),
			color: new TextInputBuilder()
				.setCustomId("color")
				.setStyle(TextInputStyle.Short)
				.setLabel("Color")
				.setRequired(false),
		};

		const modal = new ModalBuilder()
			.setCustomId("editEmbed" + message.id)
			.setTitle("Edit Embed")
			.setComponents(
				new ActionRowBuilder().setComponents(fields.title),
				new ActionRowBuilder().setComponents(fields.description),
				new ActionRowBuilder().setComponents(fields.image),
				new ActionRowBuilder().setComponents(fields.color)
			);

		await interaction.showModal(modal);

		const submit = await interaction
			.awaitModalSubmit({
				time: 60_000,
				filter: (i) => i.user.id === interaction.user.id,
			})
			.catch((error) => {
				console.log(error);
				return null;
			});

		if (submit) {
			let newEmbed = new EmbedBuilder();

			submit.fields.getTextInputValue("title")
				? newEmbed.setTitle(submit.fields.getTextInputValue("title"))
				: newEmbed.setTitle(embed.title);
			submit.fields.getTextInputValue("description")
				? newEmbed.setDescription(
						submit.fields.getTextInputValue("description")
				  )
				: newEmbed.setDescription(embed.description);
			submit.fields.getTextInputValue("color")
				? newEmbed.setColor(submit.fields.getTextInputValue("color"))
				: newEmbed.setColor(embed.color);
			submit.fields.getTextInputValue("image")
				? newEmbed.setImage(submit.fields.getTextInputValue("image"))
				: newEmbed.setImage(embed.image);

			if (message.id == submit.customId.substring(9)) {
				await message.edit({ embeds: [newEmbed] });
				await submit.reply({
					content: "Embed edited.",
					flags: MessageFlags.Ephemeral,
				});
			}
		} else {
			await interaction.reply({
				content: "Timed out.",
				flags: MessageFlags.Ephemeral,
			});
		}
	},
};
