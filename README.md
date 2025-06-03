# NewiMusicBot - Setup Guide

A high-performance Discord music bot with interactive controls, progress bars, and optimized streaming.

## Features

- **High Performance**: Optimized for fast track starts and smooth playback
- **Interactive UI**: Progress bars and button controls
- **Multiple Sources**: YouTube, YouTube Music, Spotify links (converted to YouTube)
- **Queue Management**: View, shuffle, skip, and manage your music queue
- **Smart Caching**: Reduces API calls and improves response times

## Quick Setup

### 1. Prerequisites

- **Node.js 18+** (latest LTS recommended)
- **Lavalink Server** (latest version required)

### 2. Bot Setup

1. **Clone and install:**
   ```bash
   git clone https://github.com/GalusPeres/NewiMusicBot.git
   cd NewiMusicBot
   npm install
   ```

2. **Configure the bot:**
   ```bash
   cp config/config.example.json config/config.json
   ```

3. **Edit config.json - Required fields:**
   ```json
   {
     "token": "YOUR_ACTUAL_BOT_TOKEN_HERE",
     "clientId": "YOUR_ACTUAL_CLIENT_ID_HERE"
   }
   ```

## Configuration Reference

### Required Settings
| Setting | Description | How to get |
|---------|-------------|------------|
| `token` | Your Discord bot token | [Discord Developer Portal](https://discord.com/developers/applications) → Bot → Token |
| `clientId` | Your Discord application ID | [Discord Developer Portal](https://discord.com/developers/applications) → General Information → Application ID |

### Basic Bot Settings
| Setting | Default | Description |
|---------|---------|-------------|
| `prefix` | `"."` | Command prefix (e.g., `.play`) |
| `username` | `"ExampleMusicBot"` | Internal bot name |
| `logLevel` | `"info"` | Logging level: `"error"`, `"warn"`, `"info"`, `"debug"` |

### Lavalink Connection
| Setting | Default | Description |
|---------|---------|-------------|
| `lavalinkPassword` | `"youshallnotpass"` | Password for your Lavalink server |
| `lavalinkHost` | `"localhost"` | Lavalink server hostname/IP |
| `lavalinkPort` | `2333` | Lavalink server port |

### Audio & Search
| Setting | Default | Description |
|---------|---------|-------------|
| `defaultSearchPlatform` | `"ytsearch"` | Default search: `"ytsearch"` (YouTube) or `"ytmsearch"` (YouTube Music) |
| `defaultVolume` | `40` | Default playback volume (0-100) |

### Performance Optimizations
| Setting | Default | Description |
|---------|---------|-------------|
| `lavalinkTimeout` | `15000` | Max wait time for Lavalink responses (milliseconds) |
| `connectionTimeout` | `7000` | Max wait time for voice connection (milliseconds) |
| `commandCooldown` | `2000` | Cooldown between commands per user (milliseconds) |
| `lavalinkRetryDelay` | `5000` | Wait time before retrying Lavalink connection (milliseconds) |
| `lavalinkRetryCount` | `3` | Max retry attempts for failed operations |
| `maxPlaylistSize` | `50` | Max tracks to load from playlists |
| `maxSearchResults` | `10` | Max results shown in search selection menu |
| `fastModeEnabled` | `true` | Enable all performance optimizations |

### UI Settings
| Setting | Default | Description |
|---------|---------|-------------|
| `uiUpdateInterval` | `3000` | How often to update Now Playing embed (milliseconds) - synchronized with Lavalink playerUpdateInterval |
| `fastUIUpdates` | `true` | Enable faster button responses |
| `progressBarLength` | `18` | Length of progress bar in Now Playing embed |
| `maxDisplayTracks` | `10` | Max tracks shown in queue display |
| `autoUICleanup` | `true` | Automatically remove old UI messages |

### Advanced Settings
| Setting | Default | Description |
|---------|---------|-------------|
| `autoDisconnectDelay` | `300000` | Auto-disconnect when queue empty (5 minutes) |
| `pauseTimeout` | `1200000` | Auto-stop when paused too long (20 minutes) |
| `volumeStep` | `5` | Volume change step for volume commands |
| `preBufferNext` | `true` | Pre-buffer next track for smoother transitions |
| `smartVolumeControl` | `true` | Intelligent volume management |

### Cache Settings
| Setting | Default | Description |
|---------|---------|-------------|
| `cacheEnabled` | `true` | Enable caching system for better performance |
| `cacheSearchResults` | `true` | Cache search results to avoid duplicate API calls |
| `cacheTTL` | `300` | How long to keep cached data (seconds) |
| `maxCacheSize` | `500` | Maximum number of items in cache |
| `trackQualityCache` | `true` | Cache track quality information for sorting |

### Limits
| Setting | Default | Description |
|---------|---------|-------------|
| `maxConcurrentSearches` | `3` | Max simultaneous search operations per guild |
| `maxQueueSize` | `1000` | Maximum number of tracks allowed in queue |
| `maxPreviousTracks` | `50` | Maximum number of previous tracks to remember |

## Lavalink Server

**Important: A Lavalink server is required. Use the latest version (4.0.8+) for best compatibility.**

### Optimized application.yml Configuration

Use this optimized configuration for your Lavalink server:

**Important Notes:**
- **Spotify Playlists**: You need your own Spotify credentials for playlist support. Replace `YOUR_SPOTIFY_CLIENT_ID` and `YOUR_SPOTIFY_CLIENT_SECRET` with your own values from [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
- **YouTube Plugin Updates**: YouTube frequently changes their systems. Always keep the YouTube plugin updated to the latest version and check the [YouTube Plugin Repository](https://github.com/lavalink-devs/youtube-source) for updates if you experience issues

```yaml
lavalink:
  plugins:
    # IMPORTANT: Keep this plugin updated! YouTube changes frequently
    # Check https://github.com/lavalink-devs/youtube-source for latest version
    - dependency: "dev.lavalink.youtube:youtube-plugin:1.13.2"
      snapshot: false
    - dependency: "com.github.topi314.lavasrc:lavasrc-plugin:4.4.1"
      repository: https://maven.lavalink.dev/releases
  server:
    password: youshallnotpass
    # PERFORMANCE: Optimized buffer settings
    bufferDurationMs: 800
    frameBufferDurationMs: 1000
    opusEncodingQuality: 10
    resamplingQuality: LOW
    trackStuckThresholdMs: 10000
    useSeekGhosting: true
    playerUpdateInterval: 3
    # NOTE: Synchronized with bot's uiUpdateInterval (3000ms)
    gc-warnings: false
    # PERFORMANCE: Disable unused sources
    soundcloudSearchEnabled: false
    youtubeSearchEnabled: false
    youtubePlaylistLoadLimit: 50
    sources:
      youtube: false
      http: true
      bandcamp: false
      soundcloud: false
      twitch: false
      vimeo: false
      local: false

logging:
  level:
    lavalink: WARN
    root: WARN
    dev.lavalink.youtube: INFO
    com.github.topi314.lavasrc: INFO

metrics:
  prometheus:
    enabled: false

plugins:
  youtube:
    # PERFORMANCE: Optimized client order
    clients:
      - TVHTML5EMBEDDED
      - WEBEMBEDDED  
      - WEB
      - MWEB
    
    # PERFORMANCE: Optimized client configs
    TVHTML5EMBEDDED:
      playback: true
      playlistLoading: true
      searching: false
      videoLoading: true
    WEBEMBEDDED:
      playback: true
      playlistLoading: true
      searching: false
      videoLoading: true
    WEB:
      playback: true
      playlistLoading: true
      searching: true
      videoLoading: true
    MWEB:
      playback: true
      playlistLoading: false
      searching: false
      videoLoading: false
    
    enabled: true
    allowDirectPlaylistIds: true
    allowDirectVideoIds: true
    allowSearch: true

  lavasrc:
    # PERFORMANCE: Optimized search providers
    providers:
      - "ytsearch:\"%ISRC%\""
      - "ytsearch:%QUERY%"
    sources:
      spotify: true
      youtube: true
      applemusic: false
      deezer: false
      yandexmusic: false
      flowerytts: false
      vkmusic: false
    spotify:
      # REQUIRED for Spotify playlist support - Get your own at https://developer.spotify.com/dashboard
      clientId: "YOUR_SPOTIFY_CLIENT_ID"
      clientSecret: "YOUR_SPOTIFY_CLIENT_SECRET"
      countryCode: "US"
      # PERFORMANCE: Reduced limits
      playlistLoadLimit: 3
      albumLoadLimit: 3
      resolveArtistsInSearch: false
      localFiles: false

server:
  address: 0.0.0.0
  port: 2333
```

### Starting Your Lavalink Server

1. **Configure your Lavalink server** with the application.yml above
2. **Start your Lavalink server** (method depends on your setup)
3. **Wait for the ready message**: `"Lavalink is ready to accept connections"`
4. **Make sure** the server is accessible from your bot

### 4. Start the Bot

```bash
npm start
```

## Docker Setup (Optional)

### NewiMusicBot Docker Image

You can use the official Docker image instead of manual installation:

```bash
# 1. Create config directory and copy config file
mkdir config
cp config.example.json config/config.json

# 2. Edit config/config.json with your Discord bot credentials
# Add your token and clientId!

# 3. Run the container
docker run -d \
  --name newimusicbot \
  --restart unless-stopped \
  -v ./config:/app/config \
  galusperes/newimusicbot:latest
```

**Docker Hub:** https://hub.docker.com/r/galusperes/newimusicbot

**Important:** You must configure `config/config.json` with your Discord bot token and clientId before running the container. You also need to set up a Lavalink server separately.

## Commands

### Music Playback
- `.play <song/link>` - Play a track or playlist
- `.playm <song>` - Force YouTube Music search
- `.playyt <song>` - Force YouTube search
- `.search <song>` - Search and select from multiple results

### Controls
- `.pause` / `.resume` - Pause/resume playback
- `.skip` - Skip current track
- `.previous` - Play previous track
- `.stop` - Stop and clear queue
- `.volume <0-100>` - Set volume
- `.seek <time>` - Jump to specific time (e.g., `2:30`)

### Queue Management
- `.queue` - Show queue with history
- `.playlist` - Show playlist view
- `.shuffle` - Shuffle current queue
- `.clear` - Clear queue

### Bot Management
- `.help` - Show all commands
- `.info` / `.ui` - Refresh Now Playing display
- `.disconnect` - Leave voice channel
- `.setconfig` - Change settings (Admin only)

## Troubleshooting

### YouTube Issues
**YouTube changes their systems frequently!** If you experience issues with YouTube playback:

1. **Update the YouTube Plugin**: Check [YouTube Plugin Releases](https://github.com/lavalink-devs/youtube-source/releases) for the latest version
2. **Update your application.yml**: Replace the plugin version number with the newest one
3. **Restart Lavalink**: After updating the plugin version
4. **Check Plugin Documentation**: Visit the [YouTube Plugin Repository](https://github.com/lavalink-devs/youtube-source#readme) for troubleshooting
5. **Monitor Plugin Issues**: YouTube changes can break functionality temporarily - check the plugin's GitHub issues

### Spotify Issues
**Spotify links/playlists not working?**
- **You need your own Spotify credentials** for playlist support
- Get them from [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
- Replace `YOUR_SPOTIFY_CLIENT_ID` and `YOUR_SPOTIFY_CLIENT_SECRET` in your application.yml
- **Individual Spotify tracks** work without credentials (converted to YouTube)
- **Spotify playlists** require credentials to access track metadata

**How to get Spotify credentials:**
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click "Create App"
4. Fill in app name and description (anything works)
5. Copy the "Client ID" and "Client Secret"
6. Paste them into your application.yml

### Common Problems

- **"Lavalink is not ready"**
  - Ensure Lavalink is running and shows "ready to accept connections"
  - Verify `lavalinkHost`, `lavalinkPort`, and `lavalinkPassword` match your setup

- **"No tracks found"**
  - Try different search terms
  - Check if YouTube plugin is loaded in Lavalink logs
  - Verify internet connection and YouTube accessibility

- **"Failed to connect to voice channel"**
  - Bot needs `Connect` and `Speak` permissions
  - Check if voice channel has user limits

- **Spotify links not working**
  - Ensure `lavasrc-plugin` is in your application.yml
  - For **individual tracks**: Should work without credentials (converted to YouTube)
  - For **playlists**: You need your own Spotify credentials in the application.yml
  - Check Lavalink logs for lavasrc errors

### Performance Tips

- Set `logLevel` to `"warn"` for production (less console output)
- Set `logLevel` to `"error"` for minimal logging
- Increase `lavalinkTimeout` and `connectionTimeout` on slower servers
- Reduce `maxPlaylistSize` if large playlists load slowly
- Increase `commandCooldown` to prevent command spam

## Performance Features

This bot includes several performance optimizations:

- **Fast Track Starting**: Optimized player initialization and pre-warming
- **Smart Caching**: Reduces API calls and improves response times
- **Quality Filtering**: Automatically filters out unplayable tracks
- **Buffer Optimization**: Enhanced Lavalink configuration for smooth playbook
- **UI Responsiveness**: Fast button interactions and progress updates
- **Memory Management**: Automatic cleanup of old cache entries and UI elements

## Requirements

- **Node.js**: Version 18 or higher
- **Lavalink**: Latest version (4.0.8+) 
- **YouTube Plugin**: Latest version (1.13.1+)
- **Discord Bot**: With `Connect`, `Speak`, and `Send Messages` permissions

## Support

- **GitHub Issues**: Report bugs and feature requests
- **YouTube Problems**: Visit the [YouTube Plugin Repository](https://github.com/lavalink-devs/youtube-source) for plugin-specific issues
- **Lavalink Issues**: Check the [Lavalink Documentation](https://lavalink.dev/)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Always use the latest versions of Lavalink and plugins for the best experience and compatibility.**
