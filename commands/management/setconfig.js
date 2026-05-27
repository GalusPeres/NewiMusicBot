import { EmbedBuilder, PermissionsBitField } from "discord.js";

const ENV_FOR_SETTING = Object.freeze({
  prefix: "COMMAND_PREFIX",
  defaultvolume: "DEFAULT_VOLUME",
  provider: "DEFAULT_SEARCH_PLATFORM",
});

export default {
  name: "setconfig",
  description: "Show configuration managed through environment variables.",
  async execute(client, message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("Administrator permissions are required to view configuration.");
    }

    const config = client.config;
    const prefix = config.prefix || ".";
    const subCommand = args[0]?.toLowerCase();

    if (subCommand && ENV_FOR_SETTING[subCommand]) {
      return message.reply(
        `This setting is managed by \`${ENV_FOR_SETTING[subCommand]}\`. ` +
        "Update the environment variable and restart the bot."
      );
    }

    const providerName = config.defaultSearchPlatform === "ytmsearch" ? "YouTube Music" : "YouTube";
    const overviewEmbed = new EmbedBuilder()
      .setTitle("Configuration Overview")
      .setColor("Blue")
      .addFields(
        { name: "Search Provider", value: `${providerName} (\`DEFAULT_SEARCH_PLATFORM\`)` },
        { name: "Command Prefix", value: `\`${prefix}\` (\`COMMAND_PREFIX\`)` },
        { name: "Default Volume", value: `\`${config.defaultVolume || 50}%\` (\`DEFAULT_VOLUME\`)` }
      )
      .setFooter({ text: "Settings are read from environment variables at startup." });

    return message.channel.send({ embeds: [overviewEmbed] });
  },
};
