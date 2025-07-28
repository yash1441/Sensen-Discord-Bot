const { MessageFlags } = require("discord.js");
require("dotenv").config();

module.exports = {
    cooldown: 10,
    data: {
        name: "exampleButton",
    },
    async execute(interaction) {
        await interaction.reply({
            content: "Button clicked!",
            flags: MessageFlags.Ephemeral,
        });
    },
};
