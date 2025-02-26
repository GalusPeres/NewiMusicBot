// utils/formatTrack.js
// Utility function to format track titles for display

/**
 * Formats the track title.
 * If the track was requested via URL, the title is returned as is.
 * Otherwise, if the author is provided and not already part of the title, it is prepended.
 *
 * @param {Object} trackInfo - Information about the track (title, author, etc.)
 * @param {boolean} isUrl - Indicates if the track was requested by URL.
 * @returns {string} - The formatted track title.
 */
export function formatTrackTitle(trackInfo, isUrl = false) {
  if (isUrl) return trackInfo.title;
  if (trackInfo.author) {
    const titleLower = trackInfo.title.toLowerCase();
    const authorLower = trackInfo.author.toLowerCase();
    // If the title already contains the author's name, return the title
    if (titleLower.includes(authorLower)) {
      return trackInfo.title;
    }
    // Otherwise, prepend the author's name to the title
    return `${trackInfo.author} - ${trackInfo.title}`;
  }
  return trackInfo.title;
}
