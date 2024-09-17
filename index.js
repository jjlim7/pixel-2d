/**
 * Author: Michael Hadley, mikewesthad.com
 * Asset Credits:
 *  - Tuxemon, https://github.com/Tuxemon/Tuxemon
 */
import Phaser from "phaser";
import { io } from "socket.io-client";

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
    this.otherPlayers = {};
    this.npc = null;
    this.interactKey = null;
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

    // Create a sprite with physics enabled via the physics system. The image used for the sprite has
    // a bit of whitespace, so I'm using setSize & setOffset to control the size of the player's body.
    this.player = this.physics.add
      .sprite(spawnPoint.x, spawnPoint.y, "atlas", "misa-front")
      .setSize(30, 40)
      .setOffset(0, 24);

    // Set up world bounds
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    this.player.setCollideWorldBounds(true); // Prevent sliding off screen
    this.player.body.setMaxVelocity(175); // Limit maximum velocity

    // Watch the player and worldLayer for collisions, for the duration of the scene:
    this.physics.add.collider(this.player, worldLayer);

    // Create a physics group for other players
    this.otherPlayersGroup = this.physics.add.group();

    // Add collision between the player and the other players group
    this.physics.add.collider(this.player, this.otherPlayersGroup);

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

    this.physics.add.collider(this.player, this.npc);
    // Create interaction key
    this.interactKey = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.E
    );

    // Create the player's walking animations from the texture atlas. These are stored in the global
    // animation manager so any sprite can access them.
    const anims = this.anims;
    anims.create({
      key: "misa-left-walk",
      frames: anims.generateFrameNames("atlas", {
        prefix: "misa-left-walk.",
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
    anims.create({
      key: "misa-right-walk",
      frames: anims.generateFrameNames("atlas", {
        prefix: "misa-right-walk.",
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
    anims.create({
      key: "misa-front-walk",
      frames: anims.generateFrameNames("atlas", {
        prefix: "misa-front-walk.",
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
    anims.create({
      key: "misa-back-walk",
      frames: anims.generateFrameNames("atlas", {
        prefix: "misa-back-walk.",
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });

    const camera = this.cameras.main;
    camera.startFollow(this.player);
    camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

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

    // Send new player to server
    this.socket.emit("new player", { x: this.player.x, y: this.player.y });

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
            otherPlayer.body.reset(playerInfo.x, playerInfo.y);
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
        this.updatePlayerAnimation(otherPlayer, playerInfo.direction, false);
      }
    });

    // Handle player disconnection
    this.socket.on("player disconnected", (playerId) => {
      this.otherPlayers[playerId].destroy();
      delete this.otherPlayers[playerId];
    });

    this.initDialogBox(this);
    this.greetings();
  }

  update(time, delta) {
    if (!this.player) return;

    // Stop any previous movement from the last frame
    this.player.body.setVelocity(0);

    // Check for interaction with NPC
    if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
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
    this.player.body.moves = false;
  }

  hideDialog() {
    this.dialogBox.setVisible(false);
    this.dialogText.setVisible(false);
    this.dialog = false;

    // Optionally, re-enable player movement here
    this.player.body.moves = true;
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

  updatePlayerAnimation(player, direction, isMoving) {
    if (isMoving && direction) {
      player.anims.play(`misa-${direction}-walk`, true);
    } else {
      player.anims.stop();
    }
  }

  updatePlayerMovement() {
    const speed = 135;
    const prevVelocity = this.player.body.velocity.clone();
    // Stop any previous movement from the last frame
    this.player.body.setVelocity(0);

    // Normalize and scale the velocity so that player can't move faster along a diagonal
    this.player.body.velocity.normalize().scale(speed);

    let isMoving;
    let direction;
    // Determine the direction
    if (this.cursors.left.isDown) {
      direction = "left";
      isMoving = true;
      this.player.body.setVelocityX(-speed);
    } else if (this.cursors.right.isDown) {
      direction = "right";
      isMoving = true;
      this.player.body.setVelocityX(speed);
    } else if (this.cursors.down.isDown) {
      direction = "front";
      isMoving = true;
      this.player.body.setVelocityY(speed);
    } else if (this.cursors.up.isDown) {
      direction = "back";
      isMoving = true;
      this.player.body.setVelocityY(-speed);
    } else {
      this.player.anims.stop();
      this.socket.emit("player stopped", {
        x: this.player.x,
        y: this.player.y,
        direction: this.player.direction,
      });
    }

    this.updatePlayerAnimation(this.player, direction, isMoving);

    // Send player movement or stopped state to server
    if (
      this.player.oldPosition &&
      (this.player.x !== this.player.oldPosition.x ||
        this.player.y !== this.player.oldPosition.y ||
        direction !== this.player.oldDirection)
    ) {
      this.socket.emit("player movement", {
        x: this.player.x,
        y: this.player.y,
        direction: direction,
        isMoving: isMoving,
      });
    }

    // Save old position data and moving state
    this.player.oldPosition = {
      x: this.player.x,
      y: this.player.y,
    };
    this.player.oldIsMoving = isMoving;
    this.player.oldDirection = this.player.direction;
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
    this.showGreeting(this.player, message);

    // Check if any other players are in range and show greeting for them locally
    Object.values(this.otherPlayers).forEach((otherPlayer) => {
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
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
