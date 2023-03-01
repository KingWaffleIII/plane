"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.execute = exports.data = exports.getImage = void 0;
const axios_1 = __importDefault(require("axios"));
const cheerio_1 = __importDefault(require("cheerio"));
const discord_js_1 = require("discord.js");
const air_rec_json_1 = __importDefault(require("../air_rec.json"));
const crypto = require("crypto");
const wait = require("node:timers/promises").setTimeout;
async function getImage(url) {
    try {
        const response = await axios_1.default.get(url);
        const $ = cheerio_1.default.load(response.data);
        const images = [];
        // get every a element with class pgthumb
        $("a.pgthumb").each((i, element) => {
            // get the src attribute of the child img element
            const image = $(element).children("img").attr("src");
            if (image) {
                images.push(image);
            }
        });
        const image = images[Math.floor(Math.random() * images.length)];
        return `https://www.airfighters.com/${image.replace("400", "9999")}`;
    }
    catch (error) {
        console.error(error);
        return null;
    }
}
exports.getImage = getImage;
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName("airrec")
    .setDescription("Gives you an aircraft image for you to identify.")
    .addBooleanOption((option) => option
    .setName("random")
    .setDescription("Whether to show a specific aircraft type or a random aircraft. Leave blank for a random aircraft."));
async function execute(interaction) {
    const random = interaction.options.getBoolean("random") ?? true;
    await interaction.deferReply();
    let type = air_rec_json_1.default[Object.keys(air_rec_json_1.default)[
    // Math.floor(Math.random() * Object.keys(airrec).length)
    Math.floor(Math.random() * 2) // for some reason there's a key called "default" in the object?? setting max to 2
    ]];
    if (!random) {
        const selectId = crypto.randomBytes(6).toString("hex");
        const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.StringSelectMenuBuilder()
            .setCustomId(`select-type-${selectId}`)
            .setPlaceholder("Select a type"));
        for (const aircraftType in air_rec_json_1.default) {
            if (aircraftType === "military" || aircraftType === "civilian") {
                row.components[0].addOptions({
                    label: aircraftType.charAt(0).toUpperCase() +
                        aircraftType.slice(1),
                    value: aircraftType.charAt(0).toUpperCase() +
                        aircraftType.slice(1),
                });
            }
        }
        await interaction.editReply({
            components: [row],
        });
        const filter = (i) => i.customId === `select-type-${selectId}`;
        const selections = await interaction.channel?.awaitMessageComponent({
            componentType: discord_js_1.ComponentType.StringSelect,
            time: 30000,
            filter,
        });
        if (selections) {
            if (selections.user.id !== interaction.user.id) {
                await selections.reply({
                    content: "You can't select a type.",
                    ephemeral: true,
                });
            }
            else {
                type =
                    air_rec_json_1.default[selections.values[0].toLowerCase()];
                await selections.deferUpdate();
            }
        }
    }
    const aircraft = type[Math.floor(Math.random() * type.length)];
    const image = await getImage(aircraft.image);
    if (!image) {
        await interaction.editReply({
            content: "Sorry, I encountered an issue in retrieving an image. Please try again later.",
        });
        return;
    }
    const buttonId = crypto.randomBytes(6).toString("hex");
    const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId(`reveal-airrec-${buttonId}`)
        .setLabel("Reveal answer")
        .setStyle(discord_js_1.ButtonStyle.Primary));
    await interaction.editReply({
        content: `**What is the name of this aircraft?**\n${image}`,
        components: [row],
    });
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
    const filter = (i) => i.customId === `reveal-airrec-${buttonId}`;
    const collector = interaction.channel?.createMessageComponentCollector({
        componentType: discord_js_1.ComponentType.Button,
        time: 60000,
        filter,
    });
    collector?.on("collect", async (i) => {
        if (i.user.id !== interaction.user.id) {
            await i.reply({
                content: "You can't reveal this answer.",
                ephemeral: true,
            });
        }
        else {
            await interaction.editReply({
                content: `**The answer was ${aircraft.name}!**`,
                embeds: [answer],
                components: [],
            });
        }
    });
    await wait(30000);
    await interaction.editReply({
        content: `**The answer was ${aircraft.name}!**`,
        embeds: [answer],
        components: [],
    });
}
exports.execute = execute;
