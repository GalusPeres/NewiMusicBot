// Shared serializers — keep the API response shape stable and free of internals.

export function serializeTrack(track) {
  if (!track) return null;
  const info = track.info || track;
  return {
    id: track.encoded || info.identifier,
    title: info.title,
    author: info.author,
    duration: info.duration,
    uri: info.uri,
    artwork: info.artworkUrl,
    source: info.sourceName,
    isStream: info.isStream,
    requestedBy: track.requester
      ? { id: track.requester.id, username: track.requester.username || track.requester.tag }
      : null,
  };
}

export function serializePlayer(player, client) {
  if (!player) return null;
  const voiceChannel = player.voiceChannelId
    ? client.channels.cache.get(player.voiceChannelId)
    : null;
  const repeatMap = { 0: "off", off: "off", 1: "track", track: "track", 2: "queue", queue: "queue" };
  return {
    guildId: player.guildId,
    connected: !!player.connected,
    playing: !!player.playing,
    paused: !!player.paused,
    position: player.position || 0,
    volume: player.volume,
    repeatMode: repeatMap[player.repeatMode] || "off",
    voiceChannelId: player.voiceChannelId,
    voiceChannelName: voiceChannel?.name || null,
    textChannelId: player.textChannelId,
    current: serializeTrack(player.queue?.current),
    queue: (player.queue?.tracks || []).map(serializeTrack),
    previous: (player.queue?.previous || []).slice(-10).map(serializeTrack),
  };
}

export function serializeGuild(guild, client, userId = null) {
  if (!guild) return null;
  const voiceChannels = guild.channels.cache
    .filter((c) => c.type === 2)
    .map((c) => ({
      id: c.id,
      name: c.name,
      users: c.members?.size || 0,
      userLimit: c.userLimit || 0,
    }));
  return {
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL?.({ size: 128 }) || null,
    members: guild.memberCount,
    voiceChannels,
    userVoiceChannelId: userId ? guild.voiceStates.cache.get(userId)?.channelId || null : null,
  };
}
