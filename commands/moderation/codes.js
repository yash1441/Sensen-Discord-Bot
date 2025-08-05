const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	MessageFlags,
	codeBlock,
} = require("discord.js");
const Database = require("better-sqlite3");
const path = require("path");
const db = new Database(path.join(__dirname, "../../db/codes.sqlite"));
require("dotenv").config();

module.exports = {
	category: "moderation",
	data: new SlashCommandBuilder()
		.setName("codes")
		.setDescription("Codes related commands")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("delete")
				.setDescription("Delete a user's codes record")
				.addUserOption((option) =>
					option
						.setName("user")
						.setDescription("The user to delete codes for")
						.setRequired(true)
				)
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("query")
				.setDescription("Send a query to the codes database")
				.addStringOption((option) =>
					option
						.setName("query")
						.setDescription("The query to send to the database")
						.setRequired(true)
				)
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("view")
				.setDescription("View a user's codes record")
				.addUserOption((option) =>
					option
						.setName("user")
						.setDescription("The user to view codes for")
						.setRequired(true)
				)
		),
	async execute(interaction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		if (interaction.options.getSubcommand() === "delete") {
			const user = interaction.options.getUser("user");

			const result = db
				.prepare("UPDATE codes SET discord_id = '' WHERE discord_id = ?")
				.run(user.id);

			if (!result.changes) {
				await interaction.editReply({
					content: `❌ No code entry found for ${user.username}.`,
				});
			} else {
				await interaction.editReply({
					content: `✅ Code entry deleted for ${user.username}.`,
				});
			}
		} else if (interaction.options.getSubcommand() === "query") {
			const query = interaction.options.getString("query");
			let result;
			try {
				if (query.trim().toUpperCase().startsWith("SELECT")) {
					result = db.prepare(query).all();
				} else {
					result = db.prepare(query).run();
				}
				await interaction.editReply({
					content: `✅ Query executed successfully: ${JSON.stringify(result)}`,
				});
			} catch (err) {
				await interaction.editReply({
					content: `❌ Query error: ${err.message}`,
				});
			}
		} else if (interaction.options.getSubcommand() === "view") {
			const user = interaction.options.getUser("user");
			const code = db
				.prepare("SELECT * FROM codes WHERE discord_id = ?")
				.get(user.id);

			if (!code) {
				await interaction.editReply({
					content: `❌ No code entry found for ${user.username}.`,
				});
			} else {
				await interaction.editReply({
					content: `✅ Code entry found for ${user.username}: ${codeBlock(
						JSON.stringify(code)
					)}`,
				});
			}
		}
	},
};
