/* eslint-disable no-param-reassign */
/* eslint-disable no-promise-executor-return */
import crypto from "crypto";
import {
	ActionRowBuilder,
	BaseGuildTextChannel,
	ChatInputCommandInteraction,
	ComponentType,
	SlashCommandBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuInteraction,
	EmbedBuilder,
	ButtonBuilder,
	ButtonStyle,
	ButtonInteraction,
	Message,
	InteractionCollector,
	ThreadChannel,
} from "discord.js";
import { User, Waifu } from "../models";
import { WaifuBaseData } from "./airrec";
import waifus from "../waifus.json";

interface WaifuData {
	atk: number;
	hp: number;
	spd: number;
	equipment?: Waifu;
	isEvading: boolean;
	isAbilityUsed: boolean;
	canEvade: boolean; // paveway ii
	isStunned: boolean; // sidewinder
	isBeingSupported: boolean; // trident ii
	isLaunchingBarrage: boolean; // hellfire
	hasbeenStunned: boolean; // sidewinder
}

export const data = new SlashCommandBuilder()
	.setName("dogfight")
	.setDescription("Starts a waifu dogfight with another user.")
	.addUserOption((option) =>
		option
			.setName("user")
			.setDescription("The user you want to dogfight.")
			.setRequired(true)
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	const targetUser = interaction.options.getUser("user")!;

	await interaction.deferReply();

	if (interaction.user.id === targetUser.id) {
		await interaction.editReply({
			content: "You can't dogfight yourself!",
		});
		return;
	}

	const initialUserModel = await User.findByPk(interaction.user.id, {
		include: { model: Waifu, as: "waifus" },
	});
	const targetUserModel = await User.findByPk(targetUser.id, {
		include: { model: Waifu, as: "waifus" },
	});

	if (!initialUserModel || !targetUserModel) {
		await interaction.editReply({
			content:
				"Either you or the user you want to dogfight don't have waifu collections yet! Use `/waifus` to create one!",
		});
		return;
	}

	const initialUserWaifus = (await initialUserModel.getWaifus())
		.filter((a) => a.hp !== 0 && a.spd !== 0)
		.sort((a, b) => b.atk - a.atk)
		.splice(0, 25);
	const targetUserWaifus = (await targetUserModel.getWaifus())
		.filter((a) => a.hp !== 0 && a.spd !== 0)
		.sort((a, b) => b.atk - a.atk)
		.splice(0, 25);

	if (initialUserWaifus.length === 0 || targetUserWaifus.length === 0) {
		await interaction.editReply({
			content:
				"Either you or the user you want to dogfight don't have waifus to dogfight with! Get collecting with `/airrec` and `/airrec-quiz`!",
		});
		return;
	}

	let initialWaifu: Waifu;
	let targetWaifu: Waifu;

	const initialWaifuSelectId = crypto.randomBytes(8).toString("hex");
	const initialWaifuSelect =
		new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(`dogfight-select-waifu-${initialWaifuSelectId}`)
				.setPlaceholder("Select a waifu")
		);

	initialUserWaifus.forEach((waifu) => {
		initialWaifuSelect.components[0].addOptions({
			label: `${waifu.name!} (ATK: ${waifu.atk!} | HP: ${waifu.hp!} | SPD: ${waifu.spd!})`,
			value: waifu.id!.toString(),
		});
	});

	await interaction.editReply({
		content: `<@${interaction.user.id}>, select a waifu!`,
		components: [initialWaifuSelect],
	});

	const initialWaifuSelectFilter = (i: StringSelectMenuInteraction) =>
		i.customId === `dogfight-select-waifu-${initialWaifuSelectId}`;
	const initialWaifuSelectCollector =
		interaction.channel!.createMessageComponentCollector({
			componentType: ComponentType.StringSelect,
			filter: initialWaifuSelectFilter,
			time: 60000,
		});

	initialWaifuSelectCollector.on(
		"collect",
		async (initialWaifuSelectInteraction) => {
			if (initialWaifuSelectInteraction.user.id !== interaction.user.id) {
				await initialWaifuSelectInteraction.reply({
					content: "You can't select a waifu.",
					ephemeral: true,
				});
				return;
			}

			await initialWaifuSelectInteraction.deferUpdate();

			initialWaifu = (await Waifu.findByPk(
				initialWaifuSelectInteraction.values[0],
				{
					include: { model: User, as: "user" },
				}
			)) as Waifu;

			const targetWaifuSelectId = crypto.randomBytes(8).toString("hex");
			const targetWaifuSelect =
				new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
					new StringSelectMenuBuilder()
						.setCustomId(
							`dogfight-select-waifu-${targetWaifuSelectId}`
						)
						.setPlaceholder("Select a waifu")
				);

			targetUserWaifus.forEach((waifu) => {
				targetWaifuSelect.components[0].addOptions({
					label: `${waifu.name!} (ATK: ${waifu.atk!} | HP: ${waifu.hp!} | SPD: ${waifu.spd!})`,
					value: waifu.id!.toString(),
				});
			});

			await interaction.editReply({
				content: `<@${targetUser.id}>, select a waifu! If you don't want to dogfight, ignore this message.`,
				components: [targetWaifuSelect],
			});

			const targetWaifuSelectFilter = (i: StringSelectMenuInteraction) =>
				i.customId === `dogfight-select-waifu-${targetWaifuSelectId}`;
			const targetWaifuSelectCollector =
				interaction.channel!.createMessageComponentCollector({
					componentType: ComponentType.StringSelect,
					filter: targetWaifuSelectFilter,
					time: 60000,
				});

			targetWaifuSelectCollector.on(
				"collect",
				async (targetWaifuSelectInteraction) => {
					if (
						targetWaifuSelectInteraction.user.id !== targetUser.id
					) {
						await targetWaifuSelectInteraction.reply({
							content: "You can't select a waifu.",
							ephemeral: true,
						});
						return;
					}

					await targetWaifuSelectInteraction.deferUpdate();

					targetWaifu = (await Waifu.findByPk(
						targetWaifuSelectInteraction.values[0],
						{
							include: { model: User, as: "user" },
						}
					)) as Waifu;

					await interaction.editReply({
						content: "Creating a new thread...",
						components: [],
					});

					const channel = interaction.channel as BaseGuildTextChannel;

					const thread = await channel.threads.create({
						name: `${interaction.user.username} vs ${targetUser.username}`,
						autoArchiveDuration: 60,
						reason: "Dogfight",
					});

					await interaction.editReply({
						content: `Thread created! Click here:`,
					});

					const first = [initialWaifu, targetWaifu].sort(
						(a, b) => b.spd - a.spd
					)[0];
					const second = [initialWaifu, targetWaifu].sort(
						(a, b) => b.spd - a.spd
					)[1];

					const waifuList: {
						[name: number]: WaifuData;
					} = {};
					waifuList[first.id] = {
						atk: first.atk,
						hp: first.hp,
						spd: first.spd,
						isEvading: false,
						isAbilityUsed: false,
						canEvade: true,
						isBeingSupported: false,
						isLaunchingBarrage: false,
						isStunned: false,
						hasbeenStunned: false,
					};
					waifuList[second.id] = {
						atk: second.atk,
						hp: second.hp,
						spd: second.spd,
						isEvading: false,
						isAbilityUsed: false,
						canEvade: true,
						isBeingSupported: false,
						isLaunchingBarrage: false,
						isStunned: false,
						hasbeenStunned: false,
					};

					const firstWaifu = waifuList[first.id];
					const secondWaifu = waifuList[second.id];

					const firstWaifuData: WaifuBaseData =
						waifus[first.name as keyof typeof waifus];
					const secondWaifuData: WaifuBaseData =
						waifus[second.name as keyof typeof waifus];

					const calculateDamage = (
						attacker: WaifuData,
						opponent: WaifuData
					): { isCrit: boolean; dmg: number } => {
						let dmg = attacker.atk;
						let isCrit = Math.random() < 0.1;

						// waifu abilities
						if (attacker.equipment) {
							const waifuData: WaifuBaseData =
								waifus[
									attacker.equipment
										.name as keyof typeof waifus
								];

							switch (waifuData.ability) {
								case "crit": {
									if (attacker.isAbilityUsed) break;
									isCrit = true;
									attacker.isAbilityUsed = true;
									break;
								}
								case "barrage": {
									if (attacker.isAbilityUsed) break;
									break;
								}
								case "stun": {
									if (attacker.isAbilityUsed) break;
									if (opponent.hasbeenStunned) break;
									opponent.isStunned = true;
									break;
								}
								case "heavy": {
									if (attacker.isAbilityUsed) break;
									isCrit = false;
									dmg *= 3;
									attacker.isAbilityUsed = true;
									break;
								}
								case "support": {
									if (attacker.isAbilityUsed) break;
									attacker.isBeingSupported = true;
									break;
								}
								default: {
									break;
								}
							}
						}

						if (isCrit) dmg *= 2;

						return { isCrit, dmg };
					};

					const calculateFollowUpDamage = async (
						t: ThreadChannel,
						attacker: WaifuData,
						attackerModel: Waifu,
						opponent: WaifuData,
						opponentModel: Waifu
					) => {
						if (opponent.isEvading) {
							opponent.isEvading = false;
							return;
						}

						if (attacker.isLaunchingBarrage) {
							const atk = Math.ceil(
								(attackerModel.atk + attacker.equipment!.atk) *
									0.5
							);
							await t.send(
								`<@${attackerModel.user.id}>'s ${
									attacker.equipment!.name
								} dealt **${atk}** damage to <@${
									opponentModel.user.id
								}>'s ${
									opponentModel.name
								} from its ongoing barrage! (${
									opponentModel.name
								}: ${opponent.hp} -> **${opponent.hp - atk}**)`
							);
							opponent.hp -= atk;
							return;
						}
						if (attacker.isBeingSupported) {
							const { atk } = attacker.equipment!;
							await t.send(
								`<@${attackerModel.user.id}>'s ${
									attacker.equipment!.name
								} dealt **${atk}** damage to <@${
									opponentModel.user.id
								}>'s ${
									opponentModel.name
								} from its support strike! (${
									opponentModel.name
								}: ${opponent.hp} -> **${opponent.hp - atk}**)`
							);
							opponent.hp -= atk;
							attacker.isBeingSupported = false;
						}
					};

					// don't let the while loop continue unless the collector has received a response
					const doMove = (
						main: Waifu,
						mainData: WaifuData,
						secondary: Waifu,
						secondaryData: WaifuData,
						buttonId: string,
						collector: InteractionCollector<ButtonInteraction>,
						turnMsg: Message
					) =>
						new Promise((resolve) => {
							collector.on(
								"collect",
								async (i: ButtonInteraction) => {
									if (i.user.id !== main.user.id) {
										await i.reply({
											content:
												"You can't make this move.",
											ephemeral: true,
										});
										return;
									}

									await turnMsg.delete();

									switch (i.customId) {
										case `dogfight-attack-${buttonId}`: {
											if (!secondaryData.isEvading) {
												const { isCrit, dmg } =
													calculateDamage(
														mainData,
														secondaryData
													);

												if (!isCrit) {
													await thread.send({
														content: `<@${
															main.user.id
														}> attacked, dealing ${dmg} damage! (${
															second.name
														}: ${
															secondaryData.hp
														} -> **${
															secondaryData.hp -
															dmg
														}**)`,
													});
												} else {
													await thread.send({
														content: `**Critical hit!** <@${
															main.user.id
														}> attacked, dealing ${dmg} damage! (${
															second.name
														}: ${
															secondaryData.hp
														} -> **${
															secondaryData.hp -
															dmg
														}**)`,
													});
												}

												secondaryData.hp -= dmg;
												if (secondaryData.hp <= 0) {
													resolve(false);
												}
											} else {
												await thread.send({
													content: `<@${main.user.id}> tried to attack, but <@${secondary.user.id}>'s **${secondary.name}** evaded!`,
												});
											}
											break;
										}
										case `dogfight-evade-${buttonId}`: {
											mainData.isEvading = true;
											break;
										}
										case `dogfight-equip-${buttonId}`: {
											const weaponEquipId = crypto
												.randomBytes(6)
												.toString("hex");
											const weaponEquip =
												new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
													new StringSelectMenuBuilder()

														.setCustomId(
															`dogfight-equip-weapon-${weaponEquipId}`
														)
														.setPlaceholder(
															"Select a weapon"
														)
												);

											const userWaifus = (
												await main.user!.getWaifus({
													where: {
														hp: 0,
														spd: 0,
													},
												})
											)
												.sort((a, b) => b.atk - a.atk)
												.splice(0, 25);
											userWaifus.forEach((waifu) => {
												weaponEquip.components[0].addOptions(
													{
														label: waifu.name,
														value: waifu.id.toString(),
													}
												);
											});
											const weaponEquipFilter = (
												int: StringSelectMenuInteraction
											) =>
												int.customId ===
												`dogfight-equip-weapon-${weaponEquipId}`;
											const weaponEquipCollector =
												thread.createMessageComponentCollector(
													{
														filter: weaponEquipFilter,
														time: 30000,
														componentType:
															ComponentType.StringSelect,
													}
												);
											const weaponEquipMsg =
												await thread.send({
													content: `<@${main.user.id}>, select a weapon to equip!`,
													components: [weaponEquip],
												});

											await new Promise((r) => {
												weaponEquipCollector.on(
													"collect",
													async (
														int: StringSelectMenuInteraction
													) => {
														if (
															int.user.id !==
															main.user.id
														) {
															await int.reply({
																content:
																	"You can't make this move.",
																ephemeral: true,
															});
															return;
														}

														await weaponEquipMsg.delete();

														mainData.equipment =
															(await Waifu.findByPk(
																int.values[0]
															)) as Waifu;
														mainData.atk +=
															mainData.equipment.atk;

														const equipmentData: WaifuBaseData =
															waifus[
																mainData
																	.equipment
																	.name as keyof typeof waifus
															];
														if (
															equipmentData.ability ===
															"heavy"
														)
															mainData.canEvade =
																false;
														if (
															equipmentData.ability ===
															"barrage"
														)
															mainData.isLaunchingBarrage =
																true;

														await thread.send({
															content: `<@${main.user.id}> equipped **${mainData.equipment.name}**, boosting their attack to **${mainData.atk}**!`,
														});

														r(true);
													}
												);

												weaponEquipCollector.on(
													"end",
													async (collected) => {
														if (
															collected.size === 0
														) {
															await thread.send({
																content: `<@${main.user.id}>'s **${main.name}** fled!`,
															});
															mainData.hp = 0;
															r(false);
														}
													}
												);
											});

											break;
										}
										default: {
											break;
										}
									}

									await calculateFollowUpDamage(
										thread,
										mainData,
										main,
										secondaryData,
										secondary
									);
									resolve(true);
								}
							);

							collector.on("end", async (collected) => {
								if (collected.size === 0) {
									await thread.send({
										content: `<@${main.user.id}>'s **${main.name}** fled!`,
									});
									mainData.hp = 0;
									resolve(false);
								}
							});
						});

					while (firstWaifu.hp > 0 && secondWaifu.hp > 0) {
						if (firstWaifu.isStunned) {
							await thread.send(
								`<@${first.user.id}>'s **${first.name}** is stunned!`
							);
							firstWaifu.isStunned = false;
							firstWaifu.hasbeenStunned = true;
						} else {
							const firstWaifuEmbed = new EmbedBuilder()
								.setTitle(first.name)
								.setColor(0xff00ff)
								.setAuthor({
									name: first.user.username,
									iconURL: first.user.avatarUrl ?? undefined,
								})
								.setImage(
									`attachment://${
										firstWaifuData.urlFriendlyName ??
										first.name
									}.jpg`
								)
								.setDescription(
									"Mission objective: eliminate your opponent."
								)
								.addFields(
									{
										name: "ATK",
										value: firstWaifu.atk.toString(),
										inline: true,
									},
									{
										name: "HP",
										value: firstWaifu.hp.toString(),
										inline: true,
									},
									{
										name: "SPD",
										value: firstWaifu.spd.toString(),
										inline: true,
									},
									{
										name: "Equipped Weapon",
										value: firstWaifu.equipment?.name
											? `${
													firstWaifu.equipment.name
											  } (+${firstWaifu.equipment.atk.toString()} ATK)`
											: "None! Equip a weapon for more ATK!",
										inline: true,
									}
								);
							if (firstWaifu.equipment) {
								const equipmentData: WaifuBaseData =
									waifus[
										firstWaifu.equipment
											.name as keyof typeof waifus
									];
								firstWaifuEmbed.setThumbnail(
									`attachment://${
										equipmentData.urlFriendlyName ??
										firstWaifu.equipment.name
									}.jpg`
								);
							}

							const firstDogfightId = crypto
								.randomBytes(6)
								.toString("hex");
							const firstDogfight =
								new ActionRowBuilder<ButtonBuilder>().addComponents(
									new ButtonBuilder()
										.setCustomId(
											`dogfight-attack-${firstDogfightId}`
										)
										.setStyle(ButtonStyle.Danger)
										.setLabel("Attack"),
									new ButtonBuilder()
										.setCustomId(
											`dogfight-evade-${firstDogfightId}`
										)
										.setStyle(ButtonStyle.Success)
										.setLabel("Evade"),
									new ButtonBuilder()
										.setCustomId(
											`dogfight-equip-${firstDogfightId}`
										)
										.setStyle(ButtonStyle.Primary)
										.setLabel("Equip a weapon")
								);

							if (
								firstWaifu.equipment ||
								(await Waifu.count({
									where: {
										userId: first.user.id,
										hp: 0,
										spd: 0,
									},
								})) === 0
							)
								firstDogfight.components[2].setDisabled(true);
							if (!firstWaifu.canEvade)
								firstDogfight.components[1].setDisabled(true);

							const firstDogfightFilter = (
								i: ButtonInteraction
							) =>
								i.customId ===
									`dogfight-attack-${firstDogfightId}` ||
								i.customId ===
									`dogfight-evade-${firstDogfightId}` ||
								i.customId ===
									`dogfight-equip-${firstDogfightId}`;

							const firstFiles = [firstWaifuData.path];
							if (firstWaifu.equipment)
								firstFiles.push(
									waifus[
										firstWaifu.equipment!
											.name as keyof typeof waifus
									].path
								);
							const firstTurn = await thread.send({
								content: `<@${first.user.id}>'s turn with **${first.name}**!`,
								embeds: [firstWaifuEmbed],
								components: [firstDogfight],
								files: firstFiles,
							});

							const firstDogfightCollector =
								thread.createMessageComponentCollector({
									filter: firstDogfightFilter,
									time: 30000,
									componentType: ComponentType.Button,
								});

							const firstResolve = await doMove(
								first,
								firstWaifu,
								second,
								secondWaifu,
								firstDogfightId,
								firstDogfightCollector,
								firstTurn
							);

							if (!firstResolve) {
								break;
							}
						}

						if (secondWaifu.isStunned) {
							await thread.send(
								`<@${second.user.id}>'s **${second.name}** is stunned!`
							);
							secondWaifu.isStunned = false;
							secondWaifu.hasbeenStunned = true;
						} else {
							const secondWaifuEmbed = new EmbedBuilder()
								.setTitle(second.name)
								.setColor(0xff00ff)
								.setAuthor({
									name: second.user.username,
									iconURL: second.user.avatarUrl ?? undefined,
								})
								.setImage(
									`attachment://${
										secondWaifuData.urlFriendlyName ??
										second.name
									}.jpg`
								)
								.setDescription(
									"Mission objective: eliminate your opponent."
								)
								.addFields(
									{
										name: "ATK",
										value: secondWaifu.atk.toString(),
										inline: true,
									},
									{
										name: "HP",
										value: secondWaifu.hp.toString(),
										inline: true,
									},
									{
										name: "SPD",
										value: secondWaifu.spd.toString(),
										inline: true,
									},
									{
										name: "Equipped Weapon",
										value: secondWaifu.equipment?.name
											? `${
													secondWaifu.equipment.name
											  } (+${secondWaifu.equipment.atk.toString()} ATK)`
											: "None! Equip a weapon for more ATK!",
										inline: true,
									}
								);
							if (secondWaifu.equipment) {
								const equipmentData: WaifuBaseData =
									waifus[
										secondWaifu.equipment
											.name as keyof typeof waifus
									];
								secondWaifuEmbed.setThumbnail(
									`attachment://${
										equipmentData.urlFriendlyName ??
										secondWaifu.equipment.name
									}.jpg`
								);
							}

							const secondDogfightId = crypto
								.randomBytes(6)
								.toString("hex");
							const secondDogfight =
								new ActionRowBuilder<ButtonBuilder>().addComponents(
									new ButtonBuilder()
										.setCustomId(
											`dogfight-attack-${secondDogfightId}`
										)
										.setStyle(ButtonStyle.Danger)
										.setLabel("Attack"),
									new ButtonBuilder()
										.setCustomId(
											`dogfight-evade-${secondDogfightId}`
										)
										.setStyle(ButtonStyle.Success)
										.setLabel("Evade"),
									new ButtonBuilder()
										.setCustomId(
											`dogfight-equip-${secondDogfightId}`
										)
										.setStyle(ButtonStyle.Primary)
										.setLabel("Equip a weapon")
								);

							if (
								secondWaifu.equipment ||
								(await Waifu.count({
									where: {
										userId: second.user.id,
										hp: 0,
										spd: 0,
									},
								})) === 0
							)
								secondDogfight.components[2].setDisabled(true);
							if (!secondWaifu.canEvade)
								secondDogfight.components[1].setDisabled(true);
							const secondDogfightFilter = (
								i: ButtonInteraction
							) =>
								i.customId ===
									`dogfight-attack-${secondDogfightId}` ||
								i.customId ===
									`dogfight-evade-${secondDogfightId}` ||
								i.customId ===
									`dogfight-equip-${secondDogfightId}`;

							const secondFiles = [secondWaifuData.path];
							if (secondWaifu.equipment)
								secondFiles.push(
									waifus[
										secondWaifu.equipment!
											.name as keyof typeof waifus
									].path
								);
							const secondTurn = await thread.send({
								content: `<@${second.user.id}>'s turn with **${second.name}**!`,
								embeds: [secondWaifuEmbed],
								components: [secondDogfight],
								files: secondFiles,
							});

							const secondDogfightCollector =
								thread.createMessageComponentCollector({
									filter: secondDogfightFilter,
									time: 30000,
									componentType: ComponentType.Button,
								});

							await doMove(
								second,
								secondWaifu,
								first,
								firstWaifu,
								secondDogfightId,
								secondDogfightCollector,
								secondTurn
							);
						}
					}

					if (firstWaifu.hp <= 0) {
						const victorEmbed = new EmbedBuilder()
							.setTitle(second.name)
							.setColor(0xff00ff)
							.setAuthor({
								name: second.user.username,
								iconURL: second.user.avatarUrl ?? undefined,
							})
							.setImage(
								`attachment://${
									secondWaifuData.urlFriendlyName ??
									second.name
								}.jpg`
							)
							.setDescription("You are the victor!");
						if (secondWaifu.equipment) {
							const equipmentData: WaifuBaseData =
								waifus[
									secondWaifu.equipment
										.name as keyof typeof waifus
								];
							victorEmbed.setThumbnail(
								`attachment://${
									equipmentData.urlFriendlyName ??
									secondWaifu.equipment.name
								}.jpg`
							);
						}
						const content = `<@${first.user.id}>'s **${first.name}** has been defeated! <@${second.user.id}>'s **${second.name}** wins!`;
						const files = [secondWaifuData.path];
						if (secondWaifu.equipment)
							files.push(
								waifus[
									secondWaifu.equipment
										.name as keyof typeof waifus
								].path
							);
						await thread.send({
							content,
							embeds: [victorEmbed],
							files,
						});
						await interaction.editReply({
							content,
							embeds: [victorEmbed],
							files,
						});
						await second.update({
							kills: second.kills + 1,
						});
						await first.update({
							deaths: first.deaths + 1,
						});
						await second.user.update({
							kills: second.user!.kills + 1,
						});
						await first.user.update({
							deaths: first.user!.deaths + 1,
						});
					} else if (secondWaifu.hp <= 0) {
						const victorEmbed = new EmbedBuilder()
							.setTitle(first.name)
							.setColor(0xff00ff)
							.setAuthor({
								name: first.user.username,
								iconURL: first.user.avatarUrl ?? undefined,
							})
							.setImage(
								`attachment://${
									firstWaifuData.urlFriendlyName ?? first.name
								}.jpg`
							)
							.setDescription("You are the victor!");
						if (firstWaifu.equipment) {
							const equipmentData: WaifuBaseData =
								waifus[
									firstWaifu.equipment
										.name as keyof typeof waifus
								];
							victorEmbed.setThumbnail(
								`attachment://${
									equipmentData.urlFriendlyName ??
									firstWaifu.equipment.name
								}.jpg`
							);
						}
						const content = `<@${second.user.id}>'s **${second.name}** has been defeated! <@${first.user.id}>'s **${first.name}** wins!`;
						const files = [firstWaifuData.path];
						if (firstWaifu.equipment)
							files.push(
								waifus[
									firstWaifu.equipment
										.name as keyof typeof waifus
								].path
							);
						await thread.send({
							content,
							embeds: [victorEmbed],
							files,
						});
						await interaction.editReply({
							content,
							embeds: [victorEmbed],
							files,
						});
						await first.update({
							kills: first.kills + 1,
						});
						await second.update({
							deaths: second.deaths + 1,
						});
						await first.user.update({
							kills: first.user!.kills + 1,
						});
						await second.user.update({
							deaths: second.user!.deaths + 1,
						});
					}
					await thread.setArchived(true);
				}
			);

			targetWaifuSelectCollector.on("end", async (collected) => {
				if (collected.size === 0) {
					await interaction.editReply({
						content: "The dogfight was called off.",
						components: [],
					});
				}
			});
		}
	);

	initialWaifuSelectCollector.on("end", async (collected) => {
		if (collected.size === 0) {
			await interaction.editReply({
				content: "The dogfight was called off.",
				components: [],
			});
		}
	});
}
