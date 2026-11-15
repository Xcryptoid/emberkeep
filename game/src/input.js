// Keyboard + mouse state. The canvas transform (scale + letterbox offset) is
// set by main.js each frame so mouse coordinates arrive in arena space.
export const input = {
  keys: new Set(),
  pressedKeys: new Set(),
  mouse: { x: 0, y: 0, down: false, clicked: false },
  view: { scale: 1, offsetX: 0, offsetY: 0 },

  attach(canvas) {
    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keys.add(event.code);
      this.pressedKeys.add(event.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
    canvas.addEventListener('mousemove', (event) => {
      this.mouse.x = (event.clientX - this.view.offsetX) / this.view.scale;
      this.mouse.y = (event.clientY - this.view.offsetY) / this.view.scale;
    });
    canvas.addEventListener('mousedown', (event) => {
      this.mouse.down = true;
      this.mouse.clicked = true;
      this.mouse.x = (event.clientX - this.view.offsetX) / this.view.scale;
      this.mouse.y = (event.clientY - this.view.offsetY) / this.view.scale;
    });
    window.addEventListener('mouseup', () => {
      this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  },

  setView(scale, offsetX, offsetY) {
    this.view.scale = scale;
    this.view.offsetX = offsetX;
    this.view.offsetY = offsetY;
  },

  down(code) {
    return this.keys.has(code);
  },

  // True only on the frame the key went down.
  pressed(code) {
    return this.pressedKeys.has(code);
  },

  // True only on the frame the mouse button went down.
  clicked() {
    return this.mouse.clicked;
  },

  // Movement vector from WASD / arrows, normalised.
  moveVector() {
    let x = 0;
    let y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.SQRT2;
      x *= inv;
      y *= inv;
    }
    return { x, y };
  },

  // Called at the end of each frame: edge triggers live for one frame only.
  endFrame() {
    this.pressedKeys.clear();
    this.mouse.clicked = false;
  },
};
