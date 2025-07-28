const {
	MessageFlags,
	EmbedBuilder,
	inlineCode,
	codeBlock,
} = require("discord.js");
const lark = require("../../utils/lark");
const Database = require("better-sqlite3");
const path = require("path");
require("dotenv").config();

const db = new Database(path.join(__dirname, "../../db/checkins.sqlite"), {
	verbose: console.log,
});

db.exec(`
  CREATE TABLE IF NOT EXISTS checkins (
    user_id TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL,
    streak INTEGER NOT NULL DEFAULT 0,
	last_checkin TEXT NOT NULL,
	rewards TEXT NOT NULL DEFAULT '[]',
	max_streak INTEGER NOT NULL DEFAULT 0
  )
`);

module.exports = {
	cooldown: 1, // Change this later
	data: {
		name: "checkins",
	},
	async execute(interaction) {
		await interaction.deferReply({
			flags: MessageFlags.Ephemeral,
		});

		const userId = interaction.user.id;
		const username = interaction.user.username;

		const now = new Date();
		const currentDate = now.toISOString().split("T")[0];

		const interactionReply = isNewUser(userId)
			? await createCheckin(userId, username, currentDate)
			: await updateCheckin(userId, currentDate);

		await interaction.editReply(interactionReply);
	},
};

function isNewUser(userId) {
	// Check if the user already has a check-in record
	const existingCheckin = db
		.prepare("SELECT * FROM checkins WHERE user_id = ?")
		.get(userId);

	return !existingCheckin;
}

function daysBetween(date1, date2) {
	const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
	const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());

	const diffTime = d2 - d1;
	const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
	return diffDays;
}

async function createCheckin(userId, username, currentDate) {
	const streak = 1; // Initial streak for new users

	const embed = new EmbedBuilder()
		.setColor(process.env.EMBED_COLOR)
		.setTitle("日常簽到")
		.setDescription(`✅ ${username}，你已成功簽到！`)
		.addFields({
			name: "當前累計簽到天數",
			value: `${inlineCode(streak.toString())} 天`,
		})
		.setTimestamp();

	const response = await lark.listRecords(
		process.env.DAILY_REWARDS_BASE,
		process.env.DAILY_REWARDS_TABLE,
		{
			filter: `AND(CurrentValue.[Discord ID] = "", CurrentValue.[Day] = ${streak})`,
		}
	);

	let rewards = [];
	if (response && response.total > 0) {
		rewards = [response.items[0].fields.Reward];

		const success = await lark.updateRecord(
			process.env.DAILY_REWARDS_BASE,
			process.env.DAILY_REWARDS_TABLE,
			response.items[0].record_id,
			{ fields: { "Discord ID": userId } }
		);

		if (!success)
			return {
				content: `❌ 無法為 ${username} 更新獎勵。請稍後再試。`,
			};

		embed.addFields({
			name: "獎勵",
			value: codeBlock(rewards.join(", ") || "尚未獲得任何獎勵。"),
		});
	} else {
		embed.addFields({
			name: "獎勵",
			value: codeBlock("尚未獲得任何獎勵。"),
		});
	}

	db.prepare(
		`
		INSERT INTO checkins (user_id, username, streak, last_checkin, rewards)
		VALUES (?, ?, ?, ?, ?)
	`
	).run(userId, username, streak, currentDate, JSON.stringify(rewards));

	return {
		embeds: [embed],
	};
}

async function updateCheckin(userId, currentDate) {
	const embed = new EmbedBuilder()
		.setColor(process.env.EMBED_COLOR)
		.setTitle("日常簽到")
		.setTimestamp();

	const row = db
		.prepare("SELECT * FROM checkins WHERE user_id = ?")
		.get(userId);

	const lastCheckin = new Date(row.last_checkin);
	const now = new Date();

	const lastDate = row.last_checkin;

	// Parse rewards safely
	let rewards = [];
	try {
		rewards = JSON.parse(row.rewards);
	} catch {
		rewards = [];
	}

	if (lastDate === currentDate) {
		embed.setDescription(`⏳ ${row.username}，您已完成今日簽到。請明日再試。`);
		embed.addFields(
			{
				name: "當前累計簽到天數",
				value: `${inlineCode(row.streak.toString())} 天`,
			},
			{
				name: "獎勵",
				value: codeBlock(
					rewards.length ? rewards.join(", ") : "尚未獲得任何獎勵。"
				),
			}
		);

		return {
			embeds: [embed],
		};
	}

	// Calculate streak
	const days = daysBetween(lastCheckin, now);
	const newStreak = days <= 5 ? row.streak + 1 : 1;
	const isReset = newStreak === 1;

	const updateCheckin = db.prepare(
		`UPDATE checkins
		SET streak = ?, last_checkin = ?, rewards = ?
		WHERE user_id = ?`
	);

	if (isReset) {
		updateCheckin.run(newStreak, currentDate, JSON.stringify(rewards), userId);
		embed.setDescription(
			`🔄 ${row.username}，您已有5天未進行簽到，累計簽到次數已重置為1。`
		);
		embed.addFields(
			{
				name: "當前累計簽到天數",
				value: `${inlineCode(newStreak.toString())} 天`,
			},
			{
				name: "獎勵",
				value: codeBlock(
					rewards.length ? rewards.join(", ") : "尚未獲得任何獎勵。"
				),
			}
		);

		return {
			embeds: [embed],
		};
	}

	// If streak continues
	embed.setDescription(`✅ ${row.username}，你已成功簽到！`);
	embed.addFields({
		name: "當前累計簽到天數",
		value: `${inlineCode(newStreak.toString())} 天`,
	});

	// After calculating newStreak
	const shouldGiveReward = newStreak > row.max_streak;

	if (shouldGiveReward) {
		const response = await lark.listRecords(
			process.env.DAILY_REWARDS_BASE,
			process.env.DAILY_REWARDS_TABLE,
			{
				filter: `AND(CurrentValue.[Discord ID] = "", CurrentValue.[Day] = ${newStreak})`,
			}
		);

		if (response && response.total > 0) {
			rewards.push(response.items[0].fields.Reward);

			const success = await lark.updateRecord(
				process.env.DAILY_REWARDS_BASE,
				process.env.DAILY_REWARDS_TABLE,
				response.items[0].record_id,
				{ fields: { "Discord ID": userId } }
			);

			if (!success)
				return {
					content: `❌ 無法為 ${row.username} 更新獎勵。請稍後再試。`,
				};
		}
		// Update max_streak
		db.prepare(`UPDATE checkins SET max_streak = ? WHERE user_id = ?`).run(
			newStreak,
			userId
		);
	}

	embed.addFields({
		name: "獎勵",
		value: codeBlock(
			rewards.length ? rewards.join(", ") : "尚未獲得任何獎勵。"
		),
	});

	updateCheckin.run(newStreak, currentDate, JSON.stringify(rewards), userId);

	return {
		embeds: [embed],
	};
}
