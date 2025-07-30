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
	cooldown: 15,
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
		const currentDate = now.toLocaleDateString("sv-SE", {
			timeZone: "Asia/Tokyo", // UTC+9
		});

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
		.setTitle("ログインキャンペーン")
		.setDescription(`✅ ${username} さん、チェックイン成功しました！`)
		.addFields({
			name: "累計ログイン日数",
			value: `${inlineCode(streak.toString())} 日`,
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
				content: `❌ ${username} さんの報酬を更新できませんでした。しばらくしてからもう一度お試しください。`,
			};

		embed.addFields({
			name: "報酬",
			value: codeBlock(rewards.join(", ") || "まだ報酬は獲得されていません。"),
		});
	} else {
		embed.addFields({
			name: "報酬",
			value: codeBlock("まだ報酬は獲得されていません。"),
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
		.setTitle("ログインキャンペーン")
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
		embed.setDescription(
			`⏳ ${row.username} さん、本日はすでにチェックイン済みです。明日またお試しください。`
		);
		embed.addFields(
			{
				name: "累計ログイン日数",
				value: `${inlineCode(row.streak.toString())} 日`,
			},
			{
				name: "報酬",
				value: codeBlock(
					rewards.length ? rewards.join(", ") : "まだ報酬は獲得されていません。"
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
		// Update max_streak to previous streak if it's higher
		if (row.streak > row.max_streak) {
			db.prepare(`UPDATE checkins SET max_streak = ? WHERE user_id = ?`).run(
				row.streak,
				userId
			);
		}
		updateCheckin.run(newStreak, currentDate, JSON.stringify(rewards), userId);
		embed.setDescription(
			`🔄 ${row.username} さん、5日間チェックインがされていなかったため、累計チェックイン数は「1」にリセットされました。`
		);
		embed.addFields(
			{
				name: "累計ログイン日数",
				value: `${inlineCode(newStreak.toString())} 日`,
			},
			{
				name: "報酬",
				value: codeBlock(
					rewards.length ? rewards.join(", ") : "まだ報酬は獲得されていません。"
				),
			}
		);

		return {
			embeds: [embed],
		};
	}

	// If streak continues
	embed.setDescription(`✅ ${row.username} さん、チェックイン成功しました！`);
	embed.addFields({
		name: "累計ログイン日数",
		value: `${inlineCode(newStreak.toString())} 日`,
	});

	// After calculating newStreak
	const shouldGiveReward = newStreak > row.max_streak;
	let larkSuccess = false;

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
					content: `❌ ${row.username} さんの報酬を更新できませんでした。しばらくしてからもう一度お試しください。`,
				};
			if (response && success) {
				larkSuccess = true;
				db.prepare(`UPDATE checkins SET max_streak = ? WHERE user_id = ?`).run(
					newStreak,
					userId
				);
			}
		}
	}

	embed.addFields({
		name: "報酬",
		value: codeBlock(
			rewards.length ? rewards.join(", ") : "まだ報酬は獲得されていません。"
		),
	});

	if (larkSuccess) {
		updateCheckin.run(newStreak, currentDate, JSON.stringify(rewards), userId);
		return {
			embeds: [embed],
		};
	} else {
		return {
			content: `❌ ${row.username} さんの報酬を更新できませんでした。しばらくしてからもう一度お試しください。`,
		};
	}
}
