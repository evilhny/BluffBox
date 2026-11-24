
# BluffBox

**Think fast. Make them believe. Don't fall for the bluff.**

BluffBox is a real-time multiplayer party game where players compete using a combination of knowledge, creativity, and deception.

Every round presents players with a question. Players submit fake answers designed to fool everyone else, while trying to identify the one genuine answer among all the submissions.

Can you spot the truth? Or are you good enough at bluffing to make everyone believe you?

## Play Online

You don't need to install anything to play BluffBox.

**[Play BluffBox](https://bluff.honeyplays.win/)** — Open the hosted version in your browser and start playing with friends!

## How the Game Works

BluffBox revolves around one simple idea: **submit convincing fake answers and identify the real one.**

Each round follows four stages:

1. **Question** — A question is presented to the players.
2. **Answer submission** — Players submit their own answers, attempting to create convincing bluffs.
3. **Voting** — All submitted answers are presented for voting. Players choose the answer they believe is correct.
4. **Results** — The real answer is revealed, fake-answer authors are identified, and points are awarded.

The game keeps a cumulative leaderboard, so players can compete across multiple rounds.

## How to Play

### 1. Create or Join a Game

- One player creates a game room and becomes the host.
- The host shares the room details with friends.
- Other players join the room.
- Once everyone is ready, the host starts the game.

### 2. Read the Question

A question appears for everyone in the room.

Read it carefully and think of an answer that could plausibly be correct.

### 3. Submit Your Bluff

Submit a fake answer to the question.

Your goal is to make your answer convincing enough that other players will mistake it for the real answer.

A good bluff earns you points when someone votes for it.

### 4. Vote for the Correct Answer

Once the answers have been submitted, the game moves to voting.

- Review the available answers.
- Choose the answer you believe is genuine.
- You cannot vote for your own fake answer.

Be careful: other players may have submitted very convincing bluffs!

### 5. Check the Results

After voting ends, the results screen reveals:

- The genuine answer.
- Who submitted each fake answer.
- Which players voted for each answer.
- Points earned by each player.
- The updated cumulative leaderboard.

### 6. Play the Next Round

The host can start the next round from the results screen.

Round-specific answers and votes are reset, but player scores carry over.

Keep playing and try to climb to the top of the leaderboard!

## Scoring System

BluffBox rewards both knowledge and deception.

| Action | Points |
|---|---:|
| Vote for the genuine answer | +1,000 |
| Fool another player into voting for your fake answer | +500 per fooled player |
| Vote for your own fake answer | Not allowed |

### Scoring Examples

**Example 1: Identifying the truth**

You correctly identify the genuine answer.

Your score increases by **1,000 points**.

**Example 2: Successfully bluffing**

You submit a fake answer, and three other players vote for it.

You earn:

`3 × 500 = 1,500 points`

**Example 3: Both strategies work**

You correctly identify the genuine answer and also receive votes for your fake answer.

You earn points for both actions:

`1,000 + (500 × number of players fooled)`

## Who Wins?

The player with the highest cumulative score leads the leaderboard.

- Correct answers reward knowledge.
- Convincing bluffs reward deception.
- Every round contributes to the overall score.
- Scores carry over between rounds.

The host controls the progression of the game by starting subsequent rounds. Keep playing until the group decides to finish, then check the leaderboard to see who came out on top.

## Features

- Real-time multiplayer gameplay.
- Create and join game rooms.
- Question-driven bluffing gameplay.
- Answer submission and voting phases.
- Results screen with answer and vote breakdowns.
- Individual and cumulative scoring.
- Live leaderboard.
- Multiple rounds with persistent scores.
- JSON-based question bank.
- No database required.

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | React |
| Language | TypeScript |
| Build tool | Vite |
| Backend | Node.js |
| HTTP server | Express |
| Real-time communication | Socket.IO |
| Game content | JSON |

## How It Works

BluffBox uses a client-server architecture.

The React frontend handles the user interface and communicates with the backend through Socket.IO.

The Node.js server manages game rooms, player connections, answers, voting, game phases, and scoring.

Game state and scores are managed by the server, while questions are loaded from a JSON file.

```text
                 Players' Browsers
                         |
                         v
                  React Frontend
                         |
                    Socket.IO
                         |
                         v
                 Node.js Game Server
                         |
              +----------+----------+
              |          |          |
              v          v          v
            Rooms     Game State  Scoring
                         |
                         v
                    Leaderboard
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/)
- npm

### 1. Clone the Repository

```bash
git clone https://github.com/evilhny/BluffBox.git
cd BluffBox
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
VITE_SERVER_URL=http://localhost:3010
```

For production, replace the local URL with the address of your deployed game server.

### 4. Start the Application

Start the frontend and backend together:

```bash
npm start
```

Alternatively, start them separately in two terminal windows.

**Frontend:**

```bash
npm run dev
```

**Backend:**

```bash
npm run server
```

Open the local URL printed by Vite in your browser.

## Available Scripts

| Command | Description |
|---|---|
| `npm start` | Start the frontend and backend together |
| `npm run dev` | Start the Vite development server |
| `npm run server` | Start the Node.js backend |
| `npm run build` | Build the frontend for production |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |

## Deployment

The deployed application uses separate frontend and backend services.

| Service | URL |
|---|---|
| Game frontend | [bluff.honeyplays.win](https://bluff.honeyplays.win/) |
| Game server | [bluff-api.honeyplays.win](https://bluff-api.honeyplays.win/) |

The frontend is built into static files and served through Nginx. The Node.js backend runs separately and is exposed through a reverse proxy.

Set `VITE_SERVER_URL` to the publicly reachable backend URL when building the production frontend.

## Project Structure

```text
BluffBox/
├── public/
├── server/
├── src/
├── .env.example
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Contributing

Contributions, bug reports, and feature suggestions are welcome.

1. Fork the repository.
2. Create a branch for your changes.
3. Implement and test your changes.
4. Submit a pull request with a clear description.

## License

This project is licensed under the [MIT License](LICENSE).

---

**BluffBox — The truth is out there. The points are in the bluff.**
