# NewiMusicBot

NewiMusicBot is a feature-rich Discord music bot built with Node.js, [discord.js](https://discord.js.org/), and [Lavalink](https://github.com/freyacodes/Lavalink). It supports music playback, queue management, interactive "Now Playing" controls, and more. This project is designed to be easily configurable and extensible.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Releases](#releases)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Music Playback:** Play individual tracks or entire playlists.
- **Queue Management:** View, shuffle, and manage your playback queue.
- **Interactive UI:** The bot posts a "Now Playing" embed with interactive buttons for controlling playback (e.g., previous, play/pause, skip, shuffle, stop).
- **Dynamic Configuration:** Change settings such as the default search platform via Discord commands.
- **Centralized Logging:** Configurable logging levels (debug, info, warn, error) to help you monitor and troubleshoot the bot.

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/GalusPeres/NewiMusicBot.git
   cd NewiMusicBot
   ```

2. **Install dependencies:**

   Make sure you have [Node.js](https://nodejs.org/) (v18+ recommended) installed.
   
   ```bash
   npm install
   ```

3. **Set up Lavalink:**

   Follow the [Lavalink setup guide](https://github.com/freyacodes/Lavalink) to install and run a Lavalink server. Adjust the Lavalink settings in your configuration file accordingly.

## Configuration

Rename `config/config.example.json` to `config/config.json` and edit it with your actual credentials and settings. For example:

```json
{
  "token": "YOUR_DISCORD_BOT_TOKEN",
  "prefix": ".",
  "lavalinkPassword": "youshallnotpass",
  "lavalinkHost": "localhost",
  "lavalinkPort": 2333,
  "clientId": "YOUR_CLIENT_ID",
  "username": "ExampleMusicBot",
  "defaultSearchPlatform": "ytsearch",
  "logLevel": "info"
}
```

- **token**: Your bot token from the [Discord Developer Portal](https://discord.com/developers/applications).
- **prefix**: The command prefix you want to use (e.g., `.`).
- **lavalinkPassword**: The password you set in your Lavalink server configuration.
- **lavalinkHost**: The hostname or IP of your Lavalink server (e.g., `localhost`).
- **lavalinkPort**: The port your Lavalink server listens on (default is `2333`).
- **clientId**: Your bot’s application/client ID from the Discord Developer Portal.
- **username**: (Optional) A display name used internally or for logging.
- **defaultSearchPlatform**: Choose between `"ytsearch"` (YouTube) or `"ytmsearch"` (YouTube Music).
- **logLevel**: Set to `debug`, `info`, `warn`, or `error` depending on how verbose you want the logs.

## Usage

After configuring, run the bot:

```bash
npm start
```

The bot will log in to Discord and connect to your Lavalink server. Some key commands:

- **`.play [song/link]`**  
  Plays a song or playlist. Use `.playm` (YouTube Music) or `.playyt` (YouTube) to force a specific platform.

- **`.pause` / `.playpause`**  
  Toggles pause/resume for the current track.

- **`.skip`**  
  Skips the current track.

- **`.seek [time]`**  
  Seeks to a specific time in the current track (e.g., `2`, `3:20`, `1:00:00`).

- **`.queue`**  
  Displays the current queue and track history.

- **`.volume [0-100]`**  
  Sets the playback volume.

- **`.shuffle`**  
  Shuffles the current queue.

- **`.stop`**  
  Stops playback and clears the queue.

- **`.info` / `.ui`**  
  Refreshes the "Now Playing" embed in the channel.

- **`.disconnect` / `.discon`**  
  Disconnects the bot from the voice channel.

- **`.setconfig`**  
  Opens an interactive configuration UI for updating settings like the default search platform.

## Releases

Releases are used to package stable versions of NewiMusicBot. Each release is tagged in Git and contains release notes that detail new features, bug fixes, or other changes.

**To create a release:**
1. Tag a commit:
   ```bash
   git tag -a v1.0.0 -m "Release version 1.0.0"
   git push origin --tags
   ```
2. Create a release on GitHub:
   - Go to the "Releases" section of your repository on GitHub.
   - Click "Draft a new release", select the tag, add release notes, and publish the release.

## Contributing

Contributions are welcome! If you have ideas, bug fixes, or improvements, please open an issue or submit a pull request. When contributing:

- Follow the existing coding style.
- Write descriptive commit messages.
- Update documentation when necessary.

## License

This project is licensed under the [MIT License](LICENSE).
