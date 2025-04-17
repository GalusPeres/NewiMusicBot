// commands/playback/search.js
// Lets the user pick from up to 25 search results.
// Sends a confirmation embed after the user selects a track.

import { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from "discord.js";
import { sendOrUpdateNowPlayingUI } from "../../utils/nowPlayingManager.js";
import logger from "../../utils/logger.js";

export default {
  name: "search",
  aliases: ["searchm", "searchyt"],
  description:
    "Searches for multiple tracks. Use .searchm for YouTube Music search, .searchyt for YouTube search.",
  async execute(client, message, args) {
    if (!client.lavalinkReady)
      return message.reply("Lavalink is not ready. Please wait a moment.");

    const userVC = message.member.voice.channel;
    if (!userVC) return message.reply("Join a voice channel first!");

    const query = args.join(" ").trim();
    if (!query) return message.reply("Provide a search term!");

    logger.debug(
      `[search] ${message.author.tag} requested "${query}" in VC=${userVC.id}`
    );

    const invoked = message.content
      .slice(client.config.prefix.length)
      .split(" ")[0]
      .toLowerCase();
    const forced =
      invoked === "searchm" ? "ytmsearch" : invoked === "searchyt" ? "ytsearch" : null;
    const mode = forced || client.config.defaultSearchPlatform;

    // ── player logic (destroy silent wrong‑VC player) ─────────────────
    let player = client.lavalink.getPlayer(message.guild.id);
    if (player && !player.playing && !player.paused && player.voiceChannelId !== userVC.id) {
      await player.destroy();
      client.lavalink.players.delete(message.guild.id);
      await new Promise(r => setTimeout(r, 300));
      player = null;
    }

    // create or move player
    if (!player) {
      player = await client.lavalink.createPlayer({
        guildId:       message.guild.id,
        voiceChannelId: userVC.id,
        textChannelId:  message.channel.id,
        selfDeaf:       true
      });
      await player.connect();
    } else {
      if (player.voiceChannelId !== userVC.id) {
        if (typeof player.setVoiceChannel === "function")
          await player.setVoiceChannel(userVC.id);
        else
          player.voiceChannelId = userVC.id;
        await player.connect();
      } else if (!player.connected) {
        await player.connect();
      }
    }

    if (player.volume == null)
      await player.setVolume(client.config.defaultVolume || 50, false);

    // ── perform search ────────────────────────────────────────────────
    const res = await player.search({ query: `${mode}:${query}`, source: mode }, message.author);
    if (!res?.tracks?.length) return message.reply("No tracks found.");

    const tracks = res.tracks.slice(0, 25);
    const options = tracks.map((t, i) => ({
      label: t.info.title.slice(0, 100),
      description: (t.info.author || "Unknown").slice(0, 100),
      value: String(i)
    }));

    const menu = new StringSelectMenuBuilder()
      .setCustomId("searchSelect")
      .setPlaceholder("Select a track")
      .addOptions(options);
    const row = new ActionRowBuilder().addComponents(menu);

    const selectMsg = await message.channel.send({
      content: "Select a track:",
      components: [row]
    });

    // ── handle user selection ─────────────────────────────────────────
    const collector = selectMsg.createMessageComponentCollector({ time: 30000 });
    collector.on("collect", async interaction => {
      if (!interaction.isStringSelectMenu() || interaction.customId !== "searchSelect") return;

      const idx = Number(interaction.values[0]);
      const chosen = tracks[idx];
      if (!chosen) {
        return interaction.reply({ content: "Invalid selection.", ephemeral: true });
      }

      player.queue.add(chosen);

      // confirmation (only if music already plays/paused)
      if (player.playing || player.paused) {
        const embed = new EmbedBuilder()
          .setColor("Blurple")
          .setDescription(`Added **${chosen.info.title}** to the queue.`);
        message.channel.send({ embeds: [embed] }).catch(() => {});
      }

      if (!player.playing && !player.paused) await player.play();

      await interaction.deferUpdate();
      selectMsg.delete().catch(() => {});
      await sendOrUpdateNowPlayingUI(player, message.channel);
    });

    collector.on("end", (_, reason) => {
      if (reason === "time") selectMsg.delete().catch(() => {});
    });
  }
};
