const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:9000",
    methods: ["GET", "POST"],
  },
});
// const io = socketIO(server);

const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static("__dirname"));

// Store connected players
const players = {};

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Handle new player
  socket.on("new player", (data) => {
    players[socket.id] = {
      x: data.x,
      y: data.y,
      playerId: socket.id,
    };
    // Send the current players to the new player
    socket.emit("current players", players);
    // Send the new player to all other players
    socket.broadcast.emit("new player", players[socket.id]);
  });

  // Handle player movement
  socket.on("player movement", (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].direction = data.direction;
      // Broadcast the player's movement to all other players
      socket.broadcast.emit("player moved", players[socket.id]);
    }
  });

  // Handle player stopped
  socket.on("player stopped", (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].direction = data.direction;
      players[socket.id].isMoving = false;
      // Broadcast the player's stopped state to all other players
      socket.broadcast.emit("player stopped", players[socket.id]);
    }
  });

  // Handle player greeting
  socket.on("player greeting", (data) => {
    const greetingPlayer = players[socket.id];
    if (greetingPlayer) {
      // Broadcast the greeting to all other players
      socket.broadcast.emit("player greeted", {
        playerId: socket.id,
        x: greetingPlayer.x,
        y: greetingPlayer.y,
        message: data.message,
      });
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    delete players[socket.id];
    io.emit("player disconnected", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
