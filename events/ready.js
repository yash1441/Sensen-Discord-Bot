const { Events, ActivityType } = require("discord.js");

module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
		console.log(`Ready! Logged in as ${client.user.tag}`);
		client.user.setPresence({
			activities: [
				{
					name: "杖と剣の伝説",
					type: ActivityType.Playing,
					state: "杖と剣の伝説",
				},
			],
			status: "online",
		});
	},
};
