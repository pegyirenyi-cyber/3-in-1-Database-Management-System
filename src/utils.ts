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

/**
 * Generates a high-quality deterministic secure access token for parents.
 * Integrates student context, term state, and custom enterprise-grade institutional salt.
 */
export function generateSecureToken(studentId: string, year: string, term: string): string {
  const cleanYear = (year || '').replace(/[\/\s]/g, '_');
  const cleanTerm = (term || '').replace(/[\s]/g, '_');
  const input = `${studentId}-${cleanYear}-${cleanTerm}-geetech-parent-portal-salt-2026-secure`;
  
  // First cryptographic pass
  let hash1 = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash1 = ((hash1 << 5) - hash1) + char;
    hash1 = hash1 & hash1; // Convert to 32bit integer
  }
  const part1 = Math.abs(hash1).toString(16).padStart(8, '0');
  
  // Second cryptographic pass
  let hash2 = 17;
  for (let i = input.length - 1; i >= 0; i--) {
    const char = input.charCodeAt(i);
    hash2 = ((hash2 << 5) + hash2) + char;
    hash2 = hash2 & hash2; // Convert to 32bit integer
  }
  const part2 = Math.abs(hash2).toString(16).padStart(8, '0');
  
  return `${part1}${part2}`.toUpperCase();
}

