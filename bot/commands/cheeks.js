"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.execute = exports.data = void 0;
const discord_js_1 = require("discord.js");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName("cheeks")
    .setDescription('A helpful tip on how to identify the Boeing AH-64 Apache and the Boeing RC-135 "Rivet Joint".');
async function execute(interaction) {
    await interaction.reply({
        files: [
            "./assets/cheeks.jpg",
            "./assets/AH-64.jpg",
            "./assets/RC-135.jpg",
        ],
    });
}
exports.execute = execute;
