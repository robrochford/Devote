const { Jimp } = require('jimp');

async function fixIcon() {
  // Read the image using Jimp.read() which returns a Jimp instance directly in v1.x
  const image = await Jimp.read('./resources/icon.png');
  
  // Get color near top-center edge to fill corners
  const w = image.bitmap.width;
  const h = image.bitmap.height;
  // Get color at (w/2, 2). Jimp v1 uses `getPixelColor`
  const topColorInt = image.getPixelColor(Math.floor(w / 2), 2);
  const topRgba = Jimp.intToRGBA(topColorInt);
  
  // We'll replace very bright pixels (white corners and their immediate anti-aliases) with this background color.
  // It's safer to just fill the 4 corners explicitly using a threshold.
  // For each pixel:
  image.scan(0, 0, w, h, function (x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    
    // If pixel is very bright, it's the white corner or fringe
    if (r > 200 && g > 200 && b > 200) {
      this.bitmap.data[idx + 0] = topRgba.r;
      this.bitmap.data[idx + 1] = topRgba.g;
      this.bitmap.data[idx + 2] = topRgba.b;
      this.bitmap.data[idx + 3] = 255;
    }
  });

  await image.write('./resources/icon.png');
  console.log('Icon corners have been squared out successfully!');
}

fixIcon().catch(console.error);
