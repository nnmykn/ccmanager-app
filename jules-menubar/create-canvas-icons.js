const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function createIcon(size, isTemplate = false) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  if (isTemplate) {
    // For template icons (menu bar), draw in black
    ctx.fillStyle = '#000000';
  } else {
    // For app icon, draw background
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#ffffff';
  }
  
  // Draw a lightning bolt
  const scale = size / 16;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(2, 1);
  
  ctx.beginPath();
  ctx.moveTo(9, 1);
  ctx.lineTo(4, 8);
  ctx.lineTo(7, 8);
  ctx.lineTo(5, 14);
  ctx.lineTo(11, 6);
  ctx.lineTo(8, 6);
  ctx.closePath();
  ctx.fill();
  
  ctx.restore();
  
  return canvas.toBuffer('image/png');
}

// Create menu bar icons
fs.writeFileSync(path.join(__dirname, 'assets', 'tray-icon.png'), createIcon(16, true));
fs.writeFileSync(path.join(__dirname, 'assets', 'tray-iconTemplate.png'), createIcon(16, true));
fs.writeFileSync(path.join(__dirname, 'assets', 'tray-iconTemplate@2x.png'), createIcon(32, true));

// Create app icon
fs.writeFileSync(path.join(__dirname, 'assets', 'icon.png'), createIcon(512, false));

console.log('Canvas icons created successfully!');