export default class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    this.sprite = scene.physics.add
      .sprite(x, y, "atlas", "misa-front")
      .setSize(30, 40)
      .setOffset(0, 24);
    // Set up player properties

    this.speed = 135;
    this.oldPosition = { x: null, y: null };
    this.direction = null;
    this.oldDirection = null;
    this.isMoving = false;

    this.setupPhysics();
    this.createAnims();
  }

  setupPhysics() {
    this.sprite.setCollideWorldBounds(true); // Prevent sliding off screen
    this.sprite.body.setMaxVelocity(175); // Limit maximum velocity
  }

  addCollider(objects) {
    for (const object of objects) {
      this.scene.physics.add.collider(this.sprite, object);
    }
  }

  createAnims() {
    // Create the player's walking animations from the texture atlas. These are stored in the global
    // animation manager so any sprite can access them.
    const anims = this.scene.anims;
    const animsToCreate = ["left", "right", "front", "back"];

    animsToCreate.forEach((direction) => {
      anims.create({
        key: `misa-${direction}-walk`,
        frames: anims.generateFrameNames("atlas", {
          prefix: `misa-${direction}-walk.`,
          start: 0,
          end: 3,
          zeroPad: 3,
        }),
        frameRate: 10,
        repeat: -1,
      });
    });
  }

  update(cursors) {
    // Update player logic
    const prevVelocity = this.sprite.body.velocity.clone();
    this.sprite.body.setVelocity(0);

    this.isMoving = false;

    if (cursors.left.isDown) {
      console.log("left");
      this.direction = "left";
      this.isMoving = true;
      this.sprite.body.setVelocityX(-this.speed);
    } else if (cursors.right.isDown) {
      this.direction = "right";
      this.isMoving = true;
      this.sprite.body.setVelocityX(this.speed);
    } else if (cursors.down.isDown) {
      this.direction = "front";
      this.isMoving = true;
      this.sprite.body.setVelocityY(this.speed);
    } else if (cursors.up.isDown) {
      this.direction = "back";
      this.isMoving = true;
      this.sprite.body.setVelocityY(-this.speed);
    }

    this.sprite.body.velocity.normalize().scale(this.speed);

    this.updateAnimation();

    const hasMoved =
      this.sprite.x !== this.oldPosition.x ||
      this.sprite.y !== this.oldPosition.y ||
      this.direction !== this.oldDirection;

    this.oldPosition = { x: this.x, y: this.y };
    this.oldDirection = this.direction;

    return hasMoved;
  }

  move(direction) {
    // Move player
  }

  updateAnimation() {
    if (this.isMoving) {
      this.sprite.anims.play(`misa-${this.direction}-walk`, true);
    } else {
      this.sprite.anims.stop();
    }
  }

  get x() {
    return this.sprite.x;
  }
  get y() {
    return this.sprite.y;
  }
}
