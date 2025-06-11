const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function createIcons() {
  // Create a simple ghost icon SVG
  const svgIcon = `
    <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 1C5.24 1 3 3.24 3 6v6c0 0.55 0.45 1 1 1h1v-1c0-0.55 0.45-1 1-1s1 0.45 1 1v1h2v-1c0-0.55 0.45-1 1-1s1 0.45 1 1v1h1c0.55 0 1-0.45 1-1V6c0-2.76-2.24-5-5-5z" fill="#000000"/>
      <circle cx="6" cy="7" r="1" fill="#ffffff"/>
      <circle cx="10" cy="7" r="1" fill="#ffffff"/>
    </svg>
  `;

  // Create tray icon (16x16 for macOS menu bar)
  await sharp(Buffer.from(svgIcon))
    .resize(16, 16)
    .png()
    .toFile(path.join(__dirname, 'assets', 'tray-icon.png'));

  // Create tray icon template for dark mode (16x16)
  await sharp(Buffer.from(svgIcon))
    .resize(16, 16)
    .png()
    .toFile(path.join(__dirname, 'assets', 'tray-iconTemplate.png'));

  // Create tray icon template @2x for retina displays (32x32)
  await sharp(Buffer.from(svgIcon))
    .resize(32, 32)
    .png()
    .toFile(path.join(__dirname, 'assets', 'tray-iconTemplate@2x.png'));

  // Create app icon for build (512x512)
  const appIconSvg = `
    <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" rx="80" fill="#2a2a2a"/>
      <path d="M256 80C176 80 112 144 112 224v192c0 17.6 14.4 32 32 32h32v-32c0-17.6 14.4-32 32-32s32 14.4 32 32v32h32v-32c0-17.6 14.4-32 32-32s32 14.4 32 32v32h32c17.6 0 32-14.4 32-32V224c0-80-64-144-144-144z" fill="#ffffff"/>
      <circle cx="192" cy="256" r="32" fill="#2a2a2a"/>
      <circle cx="320" cy="256" r="32" fill="#2a2a2a"/>
    </svg>
  `;

  await sharp(Buffer.from(appIconSvg))
    .resize(512, 512)
    .png()
    .toFile(path.join(__dirname, 'assets', 'icon.png'));

  console.log('Icons created successfully!');
}

createIcons().catch(console.error);