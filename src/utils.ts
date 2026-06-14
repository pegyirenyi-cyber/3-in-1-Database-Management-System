/**
 * Compresses an image base64 data string to reduce its byte size under Firestore limits.
 * Downsamples the image dimensions and applies quality compression.
 */
export function compressImage(base64Str: string, maxWidth = 250, maxHeight = 250, quality = 0.7): Promise<string> {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith('data:image')) {
      resolve(base64Str);
      return;
    }

    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions to fit within maxWidth/maxHeight preserving aspect ratio
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF'; // Ensure transparent PNG background defaults to white on JPEG compression
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        
        // Export as JPEG with the specified quality (0.0 to 1.0)
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      } else {
        resolve(base64Str);
      }
    };
    
    img.onerror = () => {
      resolve(base64Str);
    };
    
    img.src = base64Str;
  });
}
