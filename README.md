# NewiMusicBot

NewiMusicBot is a feature-rich Discord music bot built with Node.js, [discord.js](https://discord.js.org/), and [Lavalink](https://github.com/freyacodes/Lavalink). It features a sleek progress bar display and interactive buttons for controlling music playback, making it a user-friendly and visually appealing bot for your Discord server.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Releases](#releases)
- [Docker](#docker)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Music Playback:** Play individual tracks or entire playlists.
- **Queue Management:** View, shuffle, and manage your playback queue.
- **Interactive UI:** The bot posts a "Now Playing" embed with a visual progress bar and interactive buttons for controlling playback (previous, play/pause, skip, shuffle, stop).
- **Dynamic Configuration:** Easily update settings (e.g., default search platform) via Discord commands.
- **Centralized Logging:** Configurable logging levels (debug, info, warn, error) to assist in monitoring and troubleshooting the bot.

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/GalusPeres/NewiMusicBot.git
   cd NewiMusicBot
   ```

2. **Install dependencies:**

   Ensure you have [Node.js](https://nodejs.org/) (v18+ recommended) installed.
   
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
- **lavalinkPassword**: The password configured for your Lavalink server.
- **lavalinkHost**: The hostname or IP of your Lavalink server (e.g., `localhost`).
- **lavalinkPort**: The port your Lavalink server listens on (default is `2333`).
- **clientId**: Your bot’s application/client ID from the Discord Developer Portal.
- **username**: A placeholder name for internal use (the actual bot name is managed in the Discord Developer Portal).
- **defaultSearchPlatform**: Choose between `"ytsearch"` (YouTube) or `"ytmsearch"` (YouTube Music).
- **logLevel**: Set to `debug`, `info`, `warn`, or `error` depending on how verbose you want the logs.

## Usage

After configuring, start the bot:

```bash
npm start
```

The bot will log in to Discord and connect to your Lavalink server. Some key commands include:

- **`.play [song/link]`**  
  Plays a song or playlist. Use `.playm` (YouTube Music) or `.playyt` (YouTube) to force a specific platform.

- **`.pause` / `.playpause`**  
  Toggles pause/resume for the current track.

- **`.skip`**  
  Skips the current track.

- **`.seek [time]`**  
  Seeks to a specific time in the current track (e.g., `2`, `3:20`, or `1:00:00`).

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

For this initial release, we are versioning as **0.1.0**. Releases are used to package stable versions of NewiMusicBot along with release notes detailing new features or bug fixes. To create a release locally:

1. **Tag a commit:**

   ```bash
   git tag -a v0.1.0 -m "Release version 0.1.0"
   git push origin --tags
   ```

2. **Draft a release on GitHub:**
   - Navigate to the "Releases" section of your GitHub repository.
   - Click "Draft a new release".
   - Select the tag `v0.1.0`, add release notes, and publish the release.

## Docker

A Docker image for NewiMusicBot is available on DockerHub. The current Docker version is **0.1**.

### Building and Running the Docker Image Locally

1. **Build the Docker image:**

   ```bash
   docker build -t newimusicbot:0.1.0 .
   ```

2. **Run the Docker container:**

   ```bash
   docker run -d --name newimusicbot newimusicbot:0.1.0
   ```

### Pushing to DockerHub

To push your Docker image to DockerHub:

1. **Log in to DockerHub:**

   ```bash
   docker login
   ```

2. **Tag your image with your DockerHub repository name:**

   ```bash
   docker tag newimusicbot:0.1.0 galusperes/newimusicbot:0.1.0
   ```

3. **Push the image to DockerHub:**

   ```bash
   docker push galusperes/newimusicbot:0.1.0
   ```

You can view your Docker image on DockerHub here: [DockerHub - NewiMusicBot](https://hub.docker.com/repository/docker/galusperes/newimusicbot/general)

## Contributing

Contributions are welcome! If you have ideas, bug fixes, or improvements, please open an issue or submit a pull request. When contributing:

- Follow the existing coding style.
- Write descriptive commit messages.
- Update documentation when necessary.

## License

This project is licensed under the [MIT License](LICENSE).
