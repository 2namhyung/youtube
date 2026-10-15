import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';

// Keep canonical row serialization unchanged while bounding media hashing memory.
export async function streamingSha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file, {highWaterMark: 1024 * 1024})) hash.update(chunk);
  return hash.digest('hex');
}
