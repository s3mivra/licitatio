import { imageSize } from 'image-size';

export interface LoadedImage {
  bytes: Uint8Array;
  mime: 'image/png' | 'image/jpeg';
  format: 'png' | 'jpg';
  width: number;
  height: number;
}

export type ImageMap = ReadonlyMap<string, LoadedImage>;

export function loadImage(bytes: Uint8Array, mime: string): LoadedImage {
  if (mime !== 'image/png' && mime !== 'image/jpeg') throw new Error(`Unsupported image type: ${mime}`);
  const { width, height } = imageSize(bytes);
  if (!width || !height) throw new Error('Image has no readable dimensions');
  return { bytes, mime, format: mime === 'image/png' ? 'png' : 'jpg', width, height };
}
