import io from "socket.io-client";

export default class SocketManager {
  constructor(scene) {
    this.scene = scene;
    this.socket = io("http://0.0.0.0:3000");
    this.setupSocketListeners();
  }

  setupSocketListeners() {
    this.socket.on("connect", () => {
      console.log("Connected to server");
      this.emitNewPlayer();
    });

    this.socket.on("current players", (players) => {
      Object.keys(players).forEach((id) => {
        if (id !== this.socket.id) {
          this.scene.addOtherPlayer(players[id]);
        }
      });
    });

    this.socket.on("new player", (playerInfo) => {
      this.scene.addOtherPlayer(playerInfo);
    });

    this.socket.on("player moved", (playerInfo) => {
      this.scene.updateOtherPlayer(playerInfo);
    });

    this.socket.on("player stopped", (playerInfo) => {
      this.scene.stopOtherPlayer(playerInfo);
    });

    this.socket.on("player disconnected", (playerId) => {
      this.scene.removeOtherPlayer(playerId);
    });
  }

  emitNewPlayer() {
    this.socket.emit("new player", {
      x: this.scene.player.sprite.x,
      y: this.scene.player.sprite.y,
    });
  }

  emitPlayerMovement(data) {
    this.socket.emit("player movement", data);
  }

  emitPlayerStopped(data) {
    this.socket.emit("player stopped", data);
  }
}
