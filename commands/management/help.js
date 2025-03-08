import { EmbedBuilder } from "discord.js";
export default {
  name: "help",
  description: "Displays a list of available commands.",
  async execute(client, message, args) {
    const prefix = client.config.prefix || ".";

    // Fixed categories order (if desired)
    const categoryOrder = ["playback", "queue", "controls", "management", "Uncategorized"];
    const categoryDisplayNames = {
      management: "Bot Management and Info",
      playback: "Playback and Search",
      queue: "Queue Management",
      controls: "Playback Controls",
      Uncategorized: "Other Commands"
    };
    

    // Get all categories from commands (fallback to "Uncategorized")
    const allCategories = [
      ...new Set(client.commands.map(cmd => cmd.category || "Uncategorized"))
    ];

    // Sort categories: first those in categoryOrder, then any others alphabetically
    const orderedCategories = categoryOrder.filter(cat => allCategories.includes(cat));
    const otherCategories = allCategories
      .filter(cat => !categoryOrder.includes(cat))
      .sort();

    // Prepare the embed
    const embed = new EmbedBuilder()
      .setTitle("Help - Command List")
      .setColor("Blue")
      .setDescription("Here's a list of my commands, grouped by category.");

    // Loop through categories and add commands for each category
    for (const category of [...orderedCategories, ...otherCategories]) {
      const displayName = categoryDisplayNames[category] || category;
      const commandsInCategory = client.commands
        .filter(cmd => (cmd.category || "Uncategorized") === category)
        .sort((a, b) => a.name.localeCompare(b.name)); // Alphabetical order

      // Build text for each command in this category
      let categoryText = "";
      for (const cmd of commandsInCategory.values()) {
        const aliases =
          cmd.aliases && cmd.aliases.length
            ? " / " + cmd.aliases.map(a => `\`${prefix}${a}\``).join(" / ")
            : "";
        categoryText += `\`${prefix}${cmd.name}\`${aliases} – ${cmd.description}\n`;
      }

      // If the category has no commands, use a fallback message
      if (!categoryText.trim()) {
        categoryText = "No commands in this category.";
      }

      embed.addFields({
        name: displayName,
        value: categoryText
      });
    }

    // Send the embed
    await message.channel.send({ embeds: [embed] });
  }
};
