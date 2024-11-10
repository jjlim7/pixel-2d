import Phaser from "phaser";
import { io } from "socket.io-client";
import Player from "./entities/Player";

class Game extends Phaser.Scene {
  constructor() {
    super("GameScene");
    this.cursors = null;
    this.player = null;
    this.showDebug = false;
    this.dialogBox = null;
    this.dialogText = null;
    this.enterKey = null;
    this.dialog = false;
    this.socket = null;
    this.socketManager = null;
    this.otherPlayers = {};
    this.npc = null;
    this.interactKey = null;
    this.gameId = null;
  }

  preload() {
    this.load.image(
      "tiles",
      "../assets/tilesets/tuxmon-sample-32px-extruded.png"
    );
    this.load.tilemapTiledJSON("map", "../assets/tilemaps/tuxemon-town.json");
    this.load.atlas(
      "atlas",
      "../assets/atlas/atlas.png",
      "../assets/atlas/atlas.json"
    );
    this.load.atlas(
      "npc",
      "../assets/atlas/atlas.png",
      "../assets/atlas/atlas.json"
    );

    this.socket = io("http://localhost:3000");

    this.gameId =
      new URLSearchParams(window.location.search).get("gameId") ||
      "default-room";

    this.socket.on("connect", () => {
      console.log("connect: join room", this.gameId);
      this.socket.emit("join room", this.gameId);
    });
  }

  create() {
    const map = this.make.tilemap({ key: "map" });

    // Parameters are the name you gave the tileset in Tiled and then the key of the tileset image in
    // Phaser's cache (i.e. the name you used in preload)
    const tileset = map.addTilesetImage("tuxmon-sample-32px-extruded", "tiles");

    // Parameters: layer name (or index) from Tiled, tileset, x, y
    const belowLayer = map.createLayer("Below Player", tileset, 0, 0);
    const worldLayer = map.createLayer("World", tileset, 0, 0);
    const aboveLayer = map.createLayer("Above Player", tileset, 0, 0);

    worldLayer.setCollisionByProperty({ collides: true });

    // By default, everything gets depth sorted on the screen in the order we created things. Here, we
    // want the "Above Player" layer to sit on top of the player, so we explicitly give it a depth.
    // Higher depths will sit on top of lower depth objects.
    aboveLayer.setDepth(10);

    // Object layers in Tiled let you embed extra info into a map - like a spawn point or custom
    // collision shapes. In the tmx file, there's an object layer with a point named "Spawn Point"
    const spawnPoint = map.findObject(
      "Objects",
      (obj) => obj.name === "Spawn Point"
    );

    this.player = new Player(this, spawnPoint.x, spawnPoint.y);

    // Set up world bounds
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    // Create a physics group for other players
    this.otherPlayersGroup = this.physics.add.group();

    // Watch the player and worldLayer for collisions, for the duration of the scene
    // Add collision between the player and the other players group
    this.player.addCollider([worldLayer, this.otherPlayersGroup]);

    // Create NPC
    const npcSpawnPoint = map.findObject(
      "Objects",
      (obj) => obj.name === "Spawn Point 1"
    );
    this.npc = this.physics.add
      .sprite(npcSpawnPoint.x, npcSpawnPoint.y, "atlas", "misa-front")
      .setSize(30, 40)
      .setOffset(0, 24)
      .setImmovable(true);

    this.physics.add.collider(this.player.sprite, this.npc);
    // Create interaction key
    this.interactKey = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.E
    );

    const camera = this.cameras.main;
    camera.startFollow(this.player.sprite);
    camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    // Create cursor keys
    this.cursors = this.input.keyboard.createCursorKeys();

    // Help text that has a "fixed" position on the screen
    this.add
      .text(16, 16, 'Arrow keys to move\nPress "E" to interact with NPC', {
        font: "18px monospace",
        fill: "#000000",
        padding: { x: 20, y: 10 },
        backgroundColor: "#ffffff",
      })
      .setScrollFactor(0)
      .setDepth(30);

    // Send new player to server only after joining room
    this.socket.emit("new player", {
      x: this.player.sprite.x,
      y: this.player.sprite.y,
    });

    // Handle current players
    this.socket.on("current players", (players) => {
      Object.keys(players).forEach((id) => {
        if (id !== this.socket.id) {
          this.addOtherPlayer(players[id]);
        }
      });
    });

    // Handle new player
    this.socket.on("new player", (playerInfo) => {
      this.addOtherPlayer(playerInfo);
    });

    // Handle player movement
    this.socket.on("player moved", (playerInfo) => {
      const otherPlayer = this.otherPlayers[playerInfo.playerId];
      if (otherPlayer) {
        // Calculate velocity
        const dx = playerInfo.x - otherPlayer.x;
        const dy = playerInfo.y - otherPlayer.y;
        otherPlayer.vx = dx / 0.1;
        otherPlayer.vy = dy / 0.1;

        // Determine if the player is moving
        const isMoving = Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1;

        if (playerInfo.direction !== undefined) {
          // Update direction and play animation
          otherPlayer.direction = playerInfo.direction;
        }

        // Use a very short tween for smooth movement and animation
        this.tweens.add({
          targets: otherPlayer,
          x: playerInfo.x,
          y: playerInfo.y,
          duration: 60,
          ease: "Linear",
          onUpdate: () => {
            // Play animation during movement
            this.updatePlayerAnimation(
              otherPlayer,
              otherPlayer.direction,
              isMoving
            );
          },
          onComplete: () => {
            // Stop animation when movement is complete
            // this.updatePlayerAnimation(
            //   otherPlayer,
            //   otherPlayer.direction,
            //   false
            // );

            // Update the physics body position
            if (otherPlayer && otherPlayer.body) {
              otherPlayer.body.reset(playerInfo.x, playerInfo.y);
            }
          },
        });
      }
    });

    // Handle player stopped
    this.socket.on("player stopped", (playerInfo) => {
      const otherPlayer = this.otherPlayers[playerInfo.playerId];
      if (otherPlayer) {
        otherPlayer.setPosition(playerInfo.x, playerInfo.y);
        otherPlayer.body.reset(playerInfo.x, playerInfo.y);
        this.updatePlayerAnimation(
          otherPlayer,
          playerInfo.direction || "front",
          false
        );
      }
    });

    // Handle player disconnection
    this.socket.on("player disconnected", (playerId) => {
      if (this.otherPlayers[playerId]) {
        this.otherPlayers[playerId].destroy();
        delete this.otherPlayers[playerId];
      }
    });

    this.initDialogBox(this);
    this.greetings();
  }

  update(time, delta) {
    if (!this.player.sprite) return;

    // Stop any previous movement from the last frame
    this.player.sprite.body.setVelocity(0);

    // Check for interaction with NPC
    if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      const distance = Phaser.Math.Distance.Between(
        this.player.sprite.x,
        this.player.sprite.y,
        this.npc.x,
        this.npc.y
      );

      if (distance < 100) {
        // Interaction range
        console.log("Interacting with NPC");
        // Here you can add dialog or any other interaction logic

        this.showDialog("Hello, traveler! How can I help you?");
      }
    }

    if (this.dialog && Phaser.Input.Keyboard.JustDown(this.enterKey)) {
      this.hideDialog();
    }

    // Check for greeting interaction
    if (Phaser.Input.Keyboard.JustDown(this.greetKey)) {
      this.greetNearbyPlayers();
    }

    this.updatePlayerMovement();
  }

  initDialogBox(game) {
    // Create enter key for closing dialog
    this.enterKey = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER
    );

    // Create dialog box (initially hidden)
    this.dialogBox = game.add
      .rectangle(400, 550, 760, 100, 0xffffff)
      .setScrollFactor(0)
      .setDepth(30)
      .setOrigin(0.5, 1)
      .setVisible(false);

    this.dialogText = game.add
      .text(400, 550, "", {
        font: "18px monospace",
        fill: "#000000",
        backgroundColor: "#ffffff",
        padding: { x: 20, y: 10 },
        wordWrap: { width: 720, useAdvancedWrap: true },
      })
      .setScrollFactor(0)
      .setDepth(31)
      .setOrigin(0.5, 1)
      .setVisible(false);
  }

  showDialog(text) {
    this.dialogBox.setVisible(true);
    this.dialogText.setText(text);
    this.dialogText.setVisible(true);
    this.dialog = true;

    // Optionally, disable player movement here
    this.player.sprite.body.moves = false;
  }

  hideDialog() {
    this.dialogBox.setVisible(false);
    this.dialogText.setVisible(false);
    this.dialog = false;

    // Optionally, re-enable player movement here
    this.player.sprite.body.moves = true;
  }

  addOtherPlayer(playerInfo) {
    const otherPlayer = this.physics.add
      .sprite(playerInfo.x, playerInfo.y, "atlas", "misa-front")
      .setSize(30, 40)
      .setOffset(0, 24);

    otherPlayer.playerId = playerInfo.playerId;
    otherPlayer.setImmovable(true); // Make other players immovable
    otherPlayer.body.setImmovable(true);
    otherPlayer.body.moves = false; // This makes the body static
    otherPlayer.direction = playerInfo.direction || "front"; // Store initial direction
    otherPlayer.vx = 0;
    otherPlayer.vy = 0;
    otherPlayer.oldX = playerInfo.x;
    otherPlayer.oldY = playerInfo.y;

    this.otherPlayers[playerInfo.playerId] = otherPlayer;
    this.otherPlayersGroup.add(otherPlayer);
    this.updatePlayerAnimation(otherPlayer, otherPlayer.direction, false);
  }

  updateOtherPlayer(playerInfo) {
    const otherPlayer = this.otherPlayers[playerInfo.playerId];
    if (otherPlayer) {
      otherPlayer.setPosition(playerInfo.x, playerInfo.y);
      // Update animation based on direction
      otherPlayer.anims.play(`misa-${playerInfo.direction}-walk`, true);
    }
  }

  stopOtherPlayer(playerInfo) {
    const otherPlayer = this.otherPlayers[playerInfo.playerId];
    if (otherPlayer) {
      otherPlayer.anims.stop();
      otherPlayer.setTexture("atlas", `misa-${playerInfo.direction}`);
    }
  }

  removeOtherPlayer(playerId) {
    if (this.otherPlayers[playerId]) {
      this.otherPlayers[playerId].destroy();
      delete this.otherPlayers[playerId];
    }
  }

  updatePlayerAnimation(player, direction, isMoving) {
    if (!player || !player.anims) return; // Check if player and anims exist

    if (isMoving && direction) {
      player.anims.play(`misa-${direction}-walk`, true);
    } else {
      player.anims.stop();
    }
  }

  updatePlayerMovement() {
    const speed = 135;
    const prevVelocity = this.player.sprite.body.velocity.clone();
    // Stop any previous movement from the last frame
    this.player.sprite.body.setVelocity(0);

    // Normalize and scale the velocity so that player can't move faster along a diagonal
    this.player.sprite.body.velocity.normalize().scale(speed);

    const hasMoved = this.player.update(this.cursors);

    if (hasMoved) {
      console.log(hasMoved);
      this.socket.emit("player movement", {
        x: this.player.sprite.x,
        y: this.player.sprite.y,
        direction: this.player.direction,
        isMoving: this.player.isMoving,
      });
    } else if (!this.player.isMoving) {
      this.socket.emit("player stopped", {
        x: this.player.sprite.x,
        y: this.player.sprite.y,
        direction: this.player.direction,
      });
    }
  }

  greetings() {
    // Create greeting key
    this.greetKey = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.G
    );

    // Add text for instructions
    this.add
      .text(
        16,
        16,
        'Arrow keys to move\nPress "E" to interact with NPC\nPress "G" to greet nearby players',
        {
          font: "18px monospace",
          fill: "#000000",
          padding: { x: 20, y: 10 },
          backgroundColor: "#ffffff",
        }
      )
      .setScrollFactor(0)
      .setDepth(30);

    // Handle player greeted event
    this.socket.on("player greeted", (data) => {
      if (this.otherPlayers[data.playerId]) {
        this.showGreeting(this.otherPlayers[data.playerId], data.message);
      }
    });
  }

  greetNearbyPlayers() {
    const message = "Hello!";
    this.socket.emit("player greeting", { message });

    // Show greeting for the current player
    this.showGreeting(this.player.sprite, message);

    // Check if any other players are in range and show greeting for them locally
    Object.values(this.otherPlayers).forEach((otherPlayer) => {
      const distance = Phaser.Math.Distance.Between(
        this.player.sprite.x,
        this.player.sprite.y,
        otherPlayer.x,
        otherPlayer.y
      );
      if (distance <= this.greetingRange) {
        this.showGreeting(otherPlayer, message);
      }
    });
  }

  showGreeting(player, message) {
    const greetingText = this.add.text(player.x, player.y - 50, message, {
      font: "16px monospace",
      fill: "#ffffff",
      padding: { x: 10, y: 5 },
      backgroundColor: "#000000",
    });
    greetingText.setOrigin(0.5);

    // Make the greeting disappear after 2 seconds
    this.time.delayedCall(2000, () => {
      greetingText.destroy();
    });
  }
}

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: "game-container",
  pixelArt: true,
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 0 },
    },
  },
  scene: new Game(),
};

const game = new Phaser.Game(config);
