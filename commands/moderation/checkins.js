const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	MessageFlags,
	codeBlock,
} = require("discord.js");
const Database = require("better-sqlite3");
const path = require("path");
const db = new Database(path.join(__dirname, "../../db/checkins.sqlite"));
require("dotenv").config();

module.exports = {
	category: "moderation",
	data: new SlashCommandBuilder()
		.setName("checkins")
		.setDescription("Checkins related commands")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("delete")
				.setDescription("Delete a user's checkins record")
				.addUserOption((option) =>
					option
						.setName("user")
						.setDescription("The user to delete checkins for")
						.setRequired(true)
				)
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("query")
				.setDescription("Send a query to the checkins database")
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
				.setDescription("View a user's checkins record")
				.addUserOption((option) =>
					option
						.setName("user")
						.setDescription("The user to view checkins for")
						.setRequired(true)
				)
		),
	async execute(interaction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		if (interaction.options.getSubcommand() === "delete") {
			const user = interaction.options.getUser("user");

			const result = db
				.prepare("DELETE FROM checkins WHERE user_id = ?")
				.run(user.id);

			if (!result.changes) {
				await interaction.editReply({
					content: `❌ No check-in entry found for ${user.username}.`,
				});
			} else {
				await interaction.editReply({
					content: `✅ Check-in entry deleted for ${user.username}.`,
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
			const checkin = db
				.prepare("SELECT * FROM checkins WHERE user_id = ?")
				.get(user.id);

			if (!checkin) {
				await interaction.editReply({
					content: `❌ No check-in entry found for ${user.username}.`,
				});
			} else {
				await interaction.editReply({
					content: `✅ Check-in entry found for ${user.username}: ${codeBlock(
						JSON.stringify(checkin)
					)}`,
				});
			}
		}
	},
};
