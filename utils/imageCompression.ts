import { captureRef } from 'react-native-view-shot';

export interface CompressionOptions {
  quality?: number;
  width?: number;
  height?: number;
  format?: 'jpg' | 'png';
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  quality: 0.3,  // Lower quality - 30% is plenty for doodles
  width: 256,    // Larger size for better AI recognition
  height: 256,
  format: 'jpg',
};

/**
 * Compresses a canvas/view reference to a base64 string
 * @param canvasRef - React ref to the canvas/view to capture
 * @param options - Compression options (quality, width, height, format)
 * @returns Base64 string of the compressed image (without data URL prefix)
 */
export async function compressImageToBase64(
  canvasRef: React.RefObject<any>,
  options: CompressionOptions = {}
): Promise<string> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  try {
    // Capture the canvas as JPEG/PNG with optimized settings
    const imageUri = await captureRef(canvasRef, {
      format: mergedOptions.format,
      quality: mergedOptions.quality,
      width: mergedOptions.width,
      height: mergedOptions.height,
    });

    // Convert to base64
    const response = await fetch(imageUri);
    const blob = await response.blob();

    // Debug: Log the actual image size
    console.log('[Image Compression] Blob size:', blob.size, 'bytes');
    console.log('[Image Compression] Blob type:', blob.type);

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Remove the data URL prefix (e.g., "data:image/jpeg;base64,") to get just the base64 string
        const base64String = result.split(',')[1];
        console.log('[Image Compression] Base64 string length:', base64String.length);
        resolve(base64String);
      };
      reader.onerror = () => {
        reject(new Error('Failed to convert image to base64'));
      };
      reader.readAsDataURL(blob);
    });

    return base64;
  } catch (error) {
    console.error('[Image Compression] Error compressing image:', error);
    throw error;
  }
}

