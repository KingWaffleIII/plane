"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.execute = exports.data = void 0;
const discord_js_1 = require("discord.js");
const air_rec_json_1 = __importDefault(require("../air_rec.json"));
// eslint-disable-next-line import/extensions
const airrec_1 = require("./airrec");
const crypto = require("crypto");
const wait = require("node:timers/promises").setTimeout;
function checkAnswer(message, aircraft) {
    if (message.toLowerCase() === aircraft.name.toLowerCase()) {
        return 2;
    }
    if (aircraft.aliases.some((alias) => message.toLowerCase().includes(alias.toLowerCase())) ||
        message.toLowerCase().includes(aircraft.model.toLowerCase())) {
        return 1;
    }
    return 0;
}
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName("airrec-quiz")
    .setDescription("Gives you a series of aircraft images for you and others to identify with scoring.")
    .addIntegerOption((option) => option
    .setName("rounds")
    .setDescription("The number of rounds you want to play. Leave blank for 10 rounds.")
    .setMinValue(1)
    .setMaxValue(20));
async function execute(interaction) {
    const rounds = interaction.options.getInteger("rounds") ?? 10;
    const buttonId = crypto.randomBytes(12).toString("hex");
    const row = new discord_js_1.ActionRowBuilder().addComponents([
        new discord_js_1.ButtonBuilder()
            .setCustomId(`play-${buttonId}`)
            .setLabel("Play")
            .setStyle(discord_js_1.ButtonStyle.Primary),
        new discord_js_1.ButtonBuilder()
            .setCustomId(`cancel-${buttonId}`)
            .setLabel("Cancel")
            .setStyle(discord_js_1.ButtonStyle.Danger),
    ]);
    await interaction.reply({
        content: `
__**Air Recognition Quiz**__
You will be shown pictures of **${rounds}** aircraft and you will have to reply with the name of the aircraft.
You will be given 15 seconds for an answer (responses after the first will not be accepted so be careful).

__**Scoring:**__
You will get **2 points** for listing the aircraft manufacturer and model. For example: "Lockheed Martin F-22".
You will get **1 point** for listing the aircraft model or alias(es) only. For example: "F-22" or "Raptor".
The leaderboard will be shown every round.
Note: it is **very hard** to consistently get 2 points, so don't worry if you only get 1 point.

If you want to play, click the button below.
**Starting in 60 seconds...**
		`,
        components: [row],
    });
    const players = {};
    const playFilter = (i) => i.customId === `play-${buttonId}` ||
        i.customId === `cancel-${buttonId}`;
    const collector = interaction.channel?.createMessageComponentCollector({
        componentType: discord_js_1.ComponentType.Button,
        time: 60000,
        filter: playFilter,
    });
    collector?.on("collect", (i) => {
        if (i.customId === `cancel-${buttonId}`) {
            if (i.user.id !== interaction.user.id) {
                i.reply({
                    content: "You can't cancel this game.",
                    ephemeral: true,
                });
                return;
            }
            interaction.editReply({
                content: "This game has been cancelled.",
                components: [],
            });
            collector?.stop("stop");
            return;
        }
        if (!Object.keys(players).includes(i.user.id)) {
            players[i.user.id] = {
                username: i.user.username,
                score: 0,
                lastScore: 0,
            };
            i.reply({
                content: `<@${i.user.id}> has joined the game!`,
            });
        }
        else {
            i.reply({
                content: "You have already joined the game.",
                ephemeral: true,
            });
        }
    });
    collector?.on("end", async (_collected, reason) => {
        if (reason && reason === "stop") {
            return;
        }
        if (Object.keys(players).length === 0) {
            await interaction.followUp({
                content: "No one joined the game...",
            });
            return;
        }
        for (let i = 0; i < rounds; i++) {
            const type = air_rec_json_1.default[Object.keys(air_rec_json_1.default)[
            // Math.floor(Math.random() * Object.keys(airrec).length)
            Math.floor(Math.random() * 2) //! for some reason there's a key called "default" in the object?? - setting max to 2
            ]];
            const aircraft = type[Math.floor(Math.random() * type.length)];
            const image = await (0, airrec_1.getImage)(aircraft.image);
            if (!image) {
                await interaction.followUp({
                    content: "Sorry, I encountered an issue in retrieving an image. Please try again later.",
                });
                return;
            }
            await interaction.followUp({
                content: `**Round ${i + 1} of ${rounds}:**\nWhat is the name of this aircraft?\n${image}`,
                components: [],
                fetchReply: true,
            });
            //! cheat mode
            // await interaction.channel?.send({
            // 	content: aircraft.name,
            // });
            const answered = [];
            const answerFilter = (m) => {
                if (!answered.includes(m.author.id)) {
                    answered.push(m.author.id);
                    return Object.keys(players).includes(m.author.id);
                }
                return false;
            };
            const messages = await interaction.channel?.awaitMessages({
                time: 15000,
                max: Object.keys(players).length,
                filter: answerFilter,
                // errors: ["time"],
            });
            Object.keys(players).forEach((player) => {
                players[player].lastScore = players[player].score;
            });
            if (messages && messages.size > 0) {
                messages.forEach(async (message) => {
                    const score = checkAnswer(message.content, aircraft);
                    players[message.author.id].score += score;
                    //! too spammy
                    // await message.reply({
                    // 	content: `You got **${score}** point(s)!`,
                    // });
                });
            }
            const answer = new discord_js_1.EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle(aircraft.name)
                .setDescription(aircraft.role)
                .setImage(image)
                .setTimestamp()
                .setFooter({
                text: "Photo credit: https://www.airfighters.com",
            })
                .addFields({
                name: "Alternative names (aliases for /airrec-quiz):",
                value: aircraft.aliases.join(", ") || "None",
            }, 
            // { name: "\u200B", value: "\u200B" },
            {
                name: "Wikipedia:",
                value: aircraft.wiki,
                inline: true,
            }, {
                name: "See more images:",
                value: aircraft.image,
                inline: true,
            });
            const sortedPlayers = Object.keys(players).sort((a, b) => players[b].score - players[a].score);
            const leaderboard = new discord_js_1.EmbedBuilder()
                .setTitle("Leaderboard")
                .setTimestamp()
                .setDescription(sortedPlayers
                .map((userId) => {
                const player = players[userId];
                return `#${sortedPlayers.indexOf(userId) + 1} **${player.username}**: ${player.lastScore} -> **${player.score}**`;
            })
                .join("\n"))
                .setFooter({
                text: `Round ${i + 1} of ${rounds}`,
            });
            await interaction.followUp({
                content: `**The answer was ${aircraft.name}!**\nContinuing in 10 seconds...`,
                embeds: [answer, leaderboard],
            });
            await wait(10000);
        }
        const sortedPlayers = Object.keys(players).sort((a, b) => players[b].score - players[a].score);
        const leaderboard = new discord_js_1.EmbedBuilder()
            .setTitle("Final Leaderboard")
            .setDescription(sortedPlayers
            .map((userId) => {
            const player = players[userId];
            return `#${sortedPlayers.indexOf(userId) + 1} **${player.username}**: ${player.score}`;
        })
            .join("\n"))
            .setTimestamp();
        await interaction.followUp({
            content: "The game has ended! Here's the final leaderboard:",
            embeds: [leaderboard],
            components: [],
        });
    });
}
exports.execute = execute;
