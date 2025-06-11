const fs = require('fs');
const path = require('path');

// Simple 1x1 black PNG as base64
const blackPixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// Create icon files
const iconFiles = [
  'tray-icon.png',
  'tray-iconTemplate.png',
  'tray-iconTemplate@2x.png',
  'icon.png'
];

iconFiles.forEach(filename => {
  fs.writeFileSync(path.join(__dirname, 'assets', filename), blackPixel);
});

console.log('Simple icons created successfully!');