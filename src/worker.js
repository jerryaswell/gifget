/**
 * Draws and encodes off the main thread, so the page stays responsive while a
 * large or heavily effected GIF is being made. The page sends the settings
 * and the word already drawn as a sprite (a worker has no DOM to draw text
 * with); back comes the finished file.
 */
import { render, toGif } from './lib/pipeline.js';

self.onmessage = ({ data: { id, settings, sprite } }) => {
  try {
    const result = render(settings, () => sprite);
    const bytes = toGif(result);
    const info = {
      settings: result.settings,
      width: result.width,
      height: result.height,
      frames: result.frames.length,
      delay: result.delay,
      colours: Math.max(...result.frames.map((f) => f.palette.length)),
    };
    self.postMessage({ id, bytes, info }, [bytes.buffer]);
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
