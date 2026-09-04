# 🦄 Rainbow Unicorn Cascade

A colorful **Bejeweled/Tetris hybrid** built for the [js13kGames](https://js13kgames.com/) competition. 

Match blocks, survive the rising wall, and harness the power of the Rainbow Unicorn!

## 🎮 Game Overview

A wall of colored blocks rises from the bottom of the grid while single blocks fall from the top. Swap adjacent blocks to make runs of 3 or more (with bonus points for 4+ chains!). 

If you stall for too long, a bomb will crack some of your blocks. Keep making successful matches to charge up a special **Rainbow Block**, which can wipe out an entire color from the board. 

**Your goal:** Survive the level's target tick count (70 at most, depending on level) without the stack of blocks reaching the top of the grid.

## ✨ Core Mechanics

- **Wall Rise:** The entire grid shifts up periodically. If a block is in the top row when the wall rises, it's **Game Over**.
- **Falling Blocks:** Single blocks drop from the top. You can nudge them left or right while they are hovering.
- **Matching:** Swap adjacent blocks to form horizontal or vertical lines of 3+ matching colors. 
- **Bomb Timer:** If no successful match is made for 6-10 ticks (depending on level), a bomb triggers and cracks 3 random blocks (cracked blocks take up space but are worth less).
- **Rainbow Block:** After accumulating enough successful matches (25 ticks, or 10 if you're on a hot streak), a Rainbow block spawns. Swapping it with any colored block clears **every block of that color** on the board!
- **Win Condition:** Reach the level's target tick count without the stack topping out.

## 🎯 Controls

| Input | Action |
| :--- | :--- |
| **Arrow Keys** | Move the white cursor around the grid. |
| **Spacebar** | Select a block / Swap the selected block with the cursor's position. |
| **A / D** | Move the currently *hovering* falling block left or right. |
| **Mouse Drag** | Click and drag between two adjacent blocks to swap them instantly. |
| **R** | Restart the game at any time. |

## 🛠️ Development Setup

This project uses [Vite](https://vitejs.dev/) as the build tool and [LittleJS](https://github.com/KilledByAPixel/LittleJS) as the game engine.

### Prerequisites
- [Node.js](https://nodejs.org/) (comes with npm)

### Installation & Running

1. **Clone the repository** (or use `degit` to clone the template):
   ```bash
   git clone https://github.com/ccalde29/js13kgames_game.git
   cd js13kgames_game

**Install dependencies:**

```bash
npm install
   ```
   
**Run the development server:**

```bash
npm run dev
```

**Open the local URL (usually http://localhost:5173) to play.**

**Build for production (creates a minified bundle ready for js13k zipping):**
```bash
npm run build
```

🏆 Scoring & Persistence
**Base Score:** +10 per block cleared.

**Chain Bonus:** +50 for clearing a run of 4 or more.

**Rainbow Clear:** +15 per block wiped out by the rainbow effect.

***Your Best Score is automatically saved in your browser's localStorage.***

🧰 **Tech Stack**
LittleJS – Tiny, fast 2D game engine.

Vite – Next-generation frontend tooling (fast HMR and builds).

JavaScript (ES Modules) – Written in pure JS with module imports.

🙏 **Credits**
Created by ccalde29 for the js13kGames competition.
