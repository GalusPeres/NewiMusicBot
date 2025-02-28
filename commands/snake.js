// commands/snake.js
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

class SnakeGame {
  constructor() {
    this.rows = 10;
    this.cols = 10;

    // Zeichen fürs Feld
    this.EMPTY_CELL = "⬛";
    this.SNAKE_CELL = "🟩";
    this.FOOD_CELL = "🍎";

    // Erstelle das Spielfeld
    this.board = this.createEmptyBoard();

    // Schlange: Array von { x, y }, snake[0] ist der Kopf
    this.snake = [{ x: Math.floor(this.cols / 2), y: Math.floor(this.rows / 2) }];
    this.direction = { x: 0, y: 0 }; // Anfangs keine Bewegung

    // Lege ein erstes Futter
    this.food = this.randomFreeCell();

    this.gameOver = false;
  }

  createEmptyBoard() {
    return Array.from({ length: this.rows }, () =>
      Array(this.cols).fill(this.EMPTY_CELL)
    );
  }

  randomFreeCell() {
    // Finde alle freien Felder
    const freeCells = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        // Prüfe, ob kein Teil der Schlange drauf ist
        const isSnake = this.snake.some(segment => segment.x === x && segment.y === y);
        if (!isSnake) {
          freeCells.push({ x, y });
        }
      }
    }
    if (freeCells.length === 0) {
      // Theoretisch ist das Feld voll -> Spielende
      return { x: -1, y: -1 };
    }
    // Zufällig eins davon auswählen
    return freeCells[Math.floor(Math.random() * freeCells.length)];
  }

  moveSnake() {
    if (this.direction.x === 0 && this.direction.y === 0) {
      // Falls keine Richtung gesetzt, bewege dich nicht
      return;
    }
    // Kopf der Schlange
    const head = this.snake[0];
    // Neue Kopfposition
    const newHead = {
      x: head.x + this.direction.x,
      y: head.y + this.direction.y
    };

    // Check Wand-Kollision
    if (newHead.x < 0 || newHead.x >= this.cols || newHead.y < 0 || newHead.y >= this.rows) {
      this.gameOver = true;
      return;
    }

    // Check Selbst-Kollision
    if (this.snake.some(seg => seg.x === newHead.x && seg.y === newHead.y)) {
      this.gameOver = true;
      return;
    }

    // Füge den neuen Kopf hinzu
    this.snake.unshift(newHead);

    // Check Futter
    if (newHead.x === this.food.x && newHead.y === this.food.y) {
      // Schlange wächst -> Futter neu platzieren
      this.food = this.randomFreeCell();
    } else {
      // Letztes Segment entfernen (Schlange bewegt sich vorwärts)
      this.snake.pop();
    }
  }

  tick() {
    // Bewegung ausführen
    this.moveSnake();
  }

  render() {
    // Kopie vom Board erstellen
    const renderBoard = this.createEmptyBoard();

    // Futter platzieren
    if (this.food.x >= 0 && this.food.y >= 0) {
      renderBoard[this.food.y][this.food.x] = this.FOOD_CELL;
    }

    // Schlange platzieren
    for (let i = 0; i < this.snake.length; i++) {
      const seg = this.snake[i];
      renderBoard[seg.y][seg.x] = this.SNAKE_CELL;
    }

    // Als Codeblock zurückgeben
    const rowsStr = renderBoard.map(row => row.join("")).join("\n");
    return "```\n" + rowsStr + "\n```";
  }

  setDirection(dx, dy) {
    // Verhindern, dass man direkt in die entgegengesetzte Richtung lenkt
    // (Optional: In Snake kann man nicht sofort um 180° drehen.)
    if (this.direction.x + dx === 0 && this.direction.y + dy === 0) {
      // Wenn die neue Richtung entgegengesetzt der aktuellen ist, ignoriere
      return;
    }
    this.direction = { x: dx, y: dy };
  }
}

export default {
  name: "snake",
  description: "Play a simplified Snake game in Discord.",
  async execute(client, message) {
    const game = new SnakeGame();

    // Erstes Embed
    const embed = new EmbedBuilder()
      .setTitle("Snake")
      .setDescription(game.render())
      .setFooter({ text: "Use the buttons below to control the game." });

    // Steuerungs-Buttons: Oben, Links, Rechts, Unten
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("up").setLabel("⬆️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("left").setLabel("⬅️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("right").setLabel("➡️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("down").setLabel("⬇️").setStyle(ButtonStyle.Primary)
    );

    // Nachricht senden
    const gameMessage = await message.channel.send({ embeds: [embed], components: [row] });

    // Game-Loop: aktualisiert den Spielzustand alle 200 ms
    const interval = setInterval(async () => {
      if (game.gameOver) {
        clearInterval(interval);
        embed.setTitle("Snake - Game Over");
        embed.setDescription(game.render());
        await gameMessage.edit({ embeds: [embed], components: [] });
        return;
      }
      // Nächster Tick
      game.tick();
      embed.setDescription(game.render());
      await gameMessage.edit({ embeds: [embed] });
    }, 1000);

    // Button-Collector für 5 Minuten
    const collector = gameMessage.createMessageComponentCollector({ time: 300000 });
    collector.on("collect", async (interaction) => {
      if (!interaction.isButton()) return;

      switch (interaction.customId) {
        case "up":
          game.setDirection(0, -1);
          break;
        case "left":
          game.setDirection(-1, 0);
          break;
        case "right":
          game.setDirection(1, 0);
          break;
        case "down":
          game.setDirection(0, 1);
          break;
      }

      // Kein sofortiges Update nötig, da der nächste Tick in 200ms kommt
      // Aber wir können den Embed manuell updaten, damit man sieht, dass man
      // eine Richtung eingegeben hat:
      if (!game.gameOver) {
        embed.setDescription(game.render());
        await interaction.update({ embeds: [embed] });
      } else {
        // Falls das Spiel direkt endet (z. B. durch Selbstkollision),
        // setze Game Over Embed
        clearInterval(interval);
        embed.setTitle("Snake - Game Over");
        embed.setDescription(game.render());
        await interaction.update({ embeds: [embed], components: [] });
      }
    });

    collector.on("end", () => {
      // Wenn der Collector endet, das Spiel beenden
      clearInterval(interval);
      gameMessage.edit({ components: [] }).catch(() => {});
    });
  }
};
