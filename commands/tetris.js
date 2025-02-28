// commands/tetris.js
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

/**
 * Simplified Tetris engine with per-piece colors, using '🔲' for empty cells.
 * The board is displayed in a codeblock for consistent alignment.
 */
class TetrisGame {
  constructor() {
    this.rows = 20;
    this.cols = 10;
    // Use ⬛ (black square button) as empty cell
    this.EMPTY_CELL = "⬛";

    // Color map for each Tetromino type
    this.colorMap = {
      I: "🟦", // Blue
      O: "🟨", // Yellow
      T: "🟪", // Purple
      S: "🟥", // Red
      Z: "🟧", // Orange
      J: "🟫", // Brown
      L: "🟩"  // Green
    };

    // Seven standard Tetrominos
    this.tetrominoes = [
      { shape: [[1,1,1,1]], type: "I" },
      { shape: [[1,1],[1,1]], type: "O" },
      { shape: [[0,1,0],[1,1,1]], type: "T" },
      { shape: [[0,1,1],[1,1,0]], type: "S" },
      { shape: [[1,1,0],[0,1,1]], type: "Z" },
      { shape: [[1,0,0],[1,1,1]], type: "J" },
      { shape: [[0,0,1],[1,1,1]], type: "L" }
    ];

    this.board = this.createEmptyBoard();
    this.currentPiece = this.randomTetromino();
    this.currentPos = { x: 3, y: 0 };
    this.gameOver = false;
  }

  createEmptyBoard() {
    return Array.from({ length: this.rows }, () =>
      Array(this.cols).fill(this.EMPTY_CELL)
    );
  }

  randomTetromino() {
    const idx = Math.floor(Math.random() * this.tetrominoes.length);
    // Deep copy so we don't mutate the original
    return JSON.parse(JSON.stringify(this.tetrominoes[idx]));
  }

  isValidPosition(piece, pos) {
    const shape = piece.shape;
    for (let i = 0; i < shape.length; i++) {
      for (let j = 0; j < shape[i].length; j++) {
        if (shape[i][j]) {
          const x = pos.x + j;
          const y = pos.y + i;
          // Boundary checks
          if (x < 0 || x >= this.cols || y >= this.rows) return false;
          // Collision check
          if (y >= 0 && this.board[y][x] !== this.EMPTY_CELL) return false;
        }
      }
    }
    return true;
  }

  fixPiece() {
    // Fix current piece to the board
    const { shape, type } = this.currentPiece;
    for (let i = 0; i < shape.length; i++) {
      for (let j = 0; j < shape[i].length; j++) {
        if (shape[i][j]) {
          const x = this.currentPos.x + j;
          const y = this.currentPos.y + i;
          if (y >= 0 && y < this.rows && x >= 0 && x < this.cols) {
            this.board[y][x] = this.colorMap[type];
          }
        }
      }
    }
    this.clearLines();
    this.currentPiece = this.randomTetromino();
    this.currentPos = { x: 3, y: 0 };
    if (!this.isValidPosition(this.currentPiece, this.currentPos)) {
      this.gameOver = true;
    }
  }

  clearLines() {
    const newBoard = this.board.filter(row => row.includes(this.EMPTY_CELL));
    const removedLines = this.rows - newBoard.length;
    for (let i = 0; i < removedLines; i++) {
      newBoard.unshift(Array(this.cols).fill(this.EMPTY_CELL));
    }
    this.board = newBoard;
  }

  move(dx, dy) {
    const newPos = { x: this.currentPos.x + dx, y: this.currentPos.y + dy };
    if (this.isValidPosition(this.currentPiece, newPos)) {
      this.currentPos = newPos;
      return true;
    }
    return false;
  }

  rotate() {
    const oldShape = this.currentPiece.shape;
    const newShape = oldShape[0].map((_, idx) =>
      oldShape.map(row => row[idx]).reverse()
    );
    this.currentPiece.shape = newShape;
    if (!this.isValidPosition(this.currentPiece, this.currentPos)) {
      this.currentPiece.shape = oldShape;
    }
  }

  tick() {
    if (!this.move(0, 1)) {
      this.fixPiece();
    }
  }

  render() {
    // Overlay the current piece on a copy of the board
    const renderBoard = this.board.map(row => row.slice());
    const { shape, type } = this.currentPiece;
    for (let i = 0; i < shape.length; i++) {
      for (let j = 0; j < shape[i].length; j++) {
        if (shape[i][j]) {
          const x = this.currentPos.x + j;
          const y = this.currentPos.y + i;
          if (y >= 0 && y < this.rows && x >= 0 && x < this.cols) {
            renderBoard[y][x] = this.colorMap[type];
          }
        }
      }
    }
    // Return string in codeblock for alignment
    return "```\n" + renderBoard.map(row => row.join("")).join("\n") + "\n```";
  }
}

export default {
  name: "tetris",
  description: "Play an interactive Tetris game with '🔲' for empty cells and codeblock for alignment.",
  async execute(client, message) {
    const game = new TetrisGame();

    const embed = new EmbedBuilder()
      .setTitle("Tetris")
      // Put the entire board (including backticks) into the description
      .setDescription(game.render())
      .setFooter({ text: "Use the buttons below to control the game." });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("left").setLabel("⬅️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("rotate").setLabel("🔄").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("right").setLabel("➡️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("drop").setLabel("⬇️").setStyle(ButtonStyle.Primary)
    );

    const gameMessage = await message.channel.send({ embeds: [embed], components: [row] });

    // Game loop every 1000 ms
    const interval = setInterval(async () => {
      if (game.gameOver) {
        clearInterval(interval);
        embed.setTitle("Tetris - Game Over");
        embed.setDescription(game.render());
        await gameMessage.edit({ embeds: [embed], components: [] });
        return;
      }
      game.tick();
      embed.setDescription(game.render());
      await gameMessage.edit({ embeds: [embed] });
    }, 1000);

    // Button collector for 5 minutes
    const collector = gameMessage.createMessageComponentCollector({ time: 300000 });
    collector.on("collect", async (interaction) => {
      if (!interaction.isButton()) return;
      switch (interaction.customId) {
        case "left":
          game.move(-1, 0);
          break;
        case "rotate":
          game.rotate();
          break;
        case "right":
          game.move(1, 0);
          break;
        case "drop":
          while (game.move(0, 1)) {}
          game.fixPiece();
          break;
      }

      if (!game.gameOver) {
        embed.setDescription(game.render());
        await interaction.update({ embeds: [embed] });
      } else {
        clearInterval(interval);
        embed.setTitle("Tetris - Game Over");
        embed.setDescription(game.render());
        await interaction.update({ embeds: [embed], components: [] });
      }
    });

    collector.on("end", () => {
      clearInterval(interval);
      gameMessage.edit({ components: [] }).catch(() => {});
    });
  }
};
