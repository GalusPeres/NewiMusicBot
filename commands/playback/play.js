// commands/playback/play.js
// Plays a single track or an entire playlist.
// Sends a confirmation embed when tracks are added to an active queue.

import { EmbedBuilder } from "discord.js";
import { sendOrUpdateNowPlayingUI } from "../../utils/nowPlayingManager.js";
import logger from "../../utils/logger.js";

export default {
  name: "play",
  aliases: ["playm", "playyt"],
  description:
    "Plays a song or playlist. Use .playm for YouTube Music search, .playyt for YouTube search.",
  async execute(client, message, args) {
    if (!client.lavalinkReady)
      return message.reply("Lavalink is not ready. Please wait a moment.");

    const userVC = message.member.voice.channel;
    if (!userVC) return message.reply("Join a voice channel first!");

    const query = args.join(" ").trim();
    if (!query) return message.reply("Provide a song name or link.");

    logger.debug(
      `[play] ${message.author.tag} requested "${query}" in VC=${userVC.id}`
    );

    // ── search mode (alias overrides) ─────────────────────────────────
    const invoked = message.content
      .slice(client.config.prefix.length)
      .split(" ")[0]
      .toLowerCase();
    const forced =
      invoked === "playm" ? "ytmsearch" : invoked === "playyt" ? "ytsearch" : null;

    const isUrl = /^https?:\/\//.test(query);
    const isSpotify = isUrl && query.includes("spotify.com");
    const mode = isUrl
      ? isSpotify
        ? "ytmsearch"
        : "ytsearch"
      : forced || client.config.defaultSearchPlatform;
    const finalQuery = isUrl ? query : `${mode}:${query}`;

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
        await player.connect(); // always update voice state
      } else if (!player.connected) {
        await player.connect();
      }
    }

    if (player.volume == null)
      await player.setVolume(client.config.defaultVolume || 50, false);

    // ── search on Lavalink ────────────────────────────────────────────
    const res = await player.search({ query: finalQuery, source: mode }, message.author);
    if (!res?.tracks?.length) return message.reply("No tracks found for that query.");

    // ── add to queue & build confirmation ─────────────────────────────
    let confirmation = "";
    if (res.loadType === "playlist") {
      player.queue.add(res.tracks);
      confirmation = `Added **${res.tracks.length}** tracks from playlist to the queue.`;
    } else {
      player.queue.add(res.tracks[0]);
      confirmation = `Added **${res.tracks[0].info.title}** to the queue.`;
    }

    // show confirmation only when something is already playing/paused
    if (player.playing || player.paused) {
      const embed = new EmbedBuilder().setColor("Blurple").setDescription(confirmation);
      message.channel.send({ embeds: [embed] }).catch(() => {});
    }

    // ── start playback if idle, update UI ─────────────────────────────
    if (!player.playing && !player.paused) await player.play();
    await sendOrUpdateNowPlayingUI(player, message.channel);
  }
};
