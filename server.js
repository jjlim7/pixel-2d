const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://13.228.120.122:9000", "http://localhost:9000"],
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(__dirname));

// Store rooms and their players
let rooms = {};

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  let currentRoom = null;

  // Handle player joining a room
  socket.on("join room", (gameId) => {
    // Create room if it doesn't exist
    if (!rooms[gameId]) {
      rooms[gameId] = {
        players: {},
      };
    }

    // Leave current room if in one
    if (currentRoom) {
      socket.leave(currentRoom);
      delete rooms[currentRoom].players[socket.id];

      // Notify other players in old room
      socket.to(currentRoom).emit("player disconnected", socket.id);

      // Clean up empty rooms
      if (Object.keys(rooms[currentRoom].players).length === 0) {
        delete rooms[currentRoom];
      }
    }

    // Join new room
    currentRoom = gameId;
    socket.join(gameId);
    console.log(`Player ${socket.id} joined room ${gameId}`);
  });

  // Handle new player
  socket.on("new player", (data) => {
    if (!currentRoom) return;

    rooms[currentRoom].players[socket.id] = {
      x: data.x,
      y: data.y,
      playerId: socket.id,
    };

    // Send current players in this room to the new player
    socket.emit("current players", rooms[currentRoom].players);

    // Send the new player to all other players in this room
    socket
      .to(currentRoom)
      .emit("new player", rooms[currentRoom].players[socket.id]);
  });

  // Handle player movement
  socket.on("player movement", (data) => {
    if (
      !currentRoom ||
      !rooms[currentRoom] ||
      !rooms[currentRoom].players[socket.id]
    )
      return;

    const player = rooms[currentRoom].players[socket.id];
    player.x = data.x;
    player.y = data.y;
    player.direction = data.direction;

    // Broadcast the player's movement to all other players in this room
    socket.to(currentRoom).emit("player moved", player);
  });

  // Handle player stopped
  socket.on("player stopped", (data) => {
    if (
      !currentRoom ||
      !rooms[currentRoom] ||
      !rooms[currentRoom].players[socket.id]
    )
      return;

    const player = rooms[currentRoom].players[socket.id];
    player.x = data.x;
    player.y = data.y;
    player.direction = data.direction;
    player.isMoving = false;

    // Broadcast the player's stopped state to all other players in this room
    socket.to(currentRoom).emit("player stopped", player);
  });

  // Handle player greeting
  socket.on("player greeting", (data) => {
    if (
      !currentRoom ||
      !rooms[currentRoom] ||
      !rooms[currentRoom].players[socket.id]
    )
      return;

    const greetingPlayer = rooms[currentRoom].players[socket.id];

    // Broadcast the greeting to all other players in this room
    socket.to(currentRoom).emit("player greeted", {
      playerId: socket.id,
      x: greetingPlayer.x,
      y: greetingPlayer.y,
      message: data.message,
    });
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    if (currentRoom && rooms[currentRoom]) {
      // Remove player from room
      delete rooms[currentRoom].players[socket.id];

      // Notify other players in the room
      socket.to(currentRoom).emit("player disconnected", socket.id);

      // Clean up empty rooms
      if (Object.keys(rooms[currentRoom].players).length === 0) {
        delete rooms[currentRoom];
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
