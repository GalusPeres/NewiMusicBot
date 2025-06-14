// utils/emojiUtils.js
// Central emoji management with fallback to text labels

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

// Text fallback labels (no emojis)
const textLabels = {
  previous: "|◀",
  playpause: "▶||", 
  skip: "▶|",
  shuffle: "Shuffle",
  stop: "⏹",
  yt: "YT",
  ytm: "YTM"
};

/**
 * Gets an emoji object for Discord.js buttons
 * @param {string} emojiName - Name of the emoji (previous, playpause, skip, shuffle, stop, yt, ytm)
 * @param {object} config - Bot configuration object
 * @returns {object|string} - Discord.js emoji object or text string
 */
export function getEmoji(emojiName, config = global.config) {
  // Check if custom emoji IDs are configured
  const customEmojiId = config?.emojiIds?.[emojiName];
  
  if (customEmojiId) {
    // Return custom emoji object for Discord.js
    return {
      name: emojiName,
      id: customEmojiId
    };
  }
  
  // Fallback to text label
  return textLabels[emojiName] || "?";
}

/**
 * Creates a button row with appropriate emojis/labels
 * @param {object} player - Lavalink player instance
 * @param {object} config - Bot configuration object
 * @returns {ActionRowBuilder} - Discord.js button row
 */
export function createButtonRowWithEmojis(player, config = global.config) {
  const prevDisabled = !(player.queue.previous && player.queue.previous.length);
  const skipDisabled = !(player.queue.tracks && player.queue.tracks.length);
  
  const buttons = [];
  
  // Previous button
  const prevButton = new ButtonBuilder()
    .setCustomId("previous")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(prevDisabled);
  
  const prevEmoji = getEmoji("previous", config);
  if (typeof prevEmoji === 'object') {
    prevButton.setEmoji(prevEmoji);
  } else {
    prevButton.setLabel(prevEmoji);
  }
  buttons.push(prevButton);
  
  // Play/Pause button
  const playButton = new ButtonBuilder()
    .setCustomId("playpause")
    .setStyle(ButtonStyle.Primary);
  
  const playEmoji = getEmoji("playpause", config);
  if (typeof playEmoji === 'object') {
    playButton.setEmoji(playEmoji);
  } else {
    playButton.setLabel(playEmoji);
  }
  buttons.push(playButton);
  
  // Skip button
  const skipButton = new ButtonBuilder()
    .setCustomId("skip")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(skipDisabled);
  
  const skipEmoji = getEmoji("skip", config);
  if (typeof skipEmoji === 'object') {
    skipButton.setEmoji(skipEmoji);
  } else {
    skipButton.setLabel(skipEmoji);
  }
  buttons.push(skipButton);
  
  // Shuffle button
  const shuffleButton = new ButtonBuilder()
    .setCustomId("shuffle")
    .setStyle(ButtonStyle.Success);
  
  const shuffleEmoji = getEmoji("shuffle", config);
  if (typeof shuffleEmoji === 'object') {
    shuffleButton.setEmoji(shuffleEmoji);
  } else {
    shuffleButton.setLabel(shuffleEmoji);
  }
  buttons.push(shuffleButton);
  
  // Stop button
  const stopButton = new ButtonBuilder()
    .setCustomId("stop")
    .setStyle(ButtonStyle.Danger);
  
  const stopEmoji = getEmoji("stop", config);
  if (typeof stopEmoji === 'object') {
    stopButton.setEmoji(stopEmoji);
  } else {
    stopButton.setLabel(stopEmoji);
  }
  buttons.push(stopButton);
  
  return new ActionRowBuilder().addComponents(buttons);
}

/**
 * Gets display emoji for text (used in setconfig, etc.)
 * @param {string} emojiName - Name of the emoji
 * @param {object} config - Bot configuration object
 * @returns {string} - Formatted emoji string for display
 */
export function getDisplayEmoji(emojiName, config = global.config) {
  const customEmojiId = config?.emojiIds?.[emojiName];
  
  if (customEmojiId) {
    // Return formatted custom emoji for display
    return `<:${emojiName}:${customEmojiId}>`;
  }
  
  // Return text label
  return textLabels[emojiName] || "?";
}