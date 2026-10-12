import path from 'node:path';

export function buildFfprobeInvocation({ executable, renderPath, cwd, streamOnly = false }) {
  if (!path.isAbsolute(executable) || !path.isAbsolute(renderPath) || !path.isAbsolute(cwd)) throw new Error('FFprobe invocation paths must be absolute');
  const entries = streamOnly ? ['-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,avg_frame_rate,nb_read_frames'] : ['-show_entries', 'format=duration,size'];
  return { executable, args: ['-v', 'error', ...entries, '-of', 'json', renderPath], cwd };
}

export function buildFfprobeEnvironment(environment = process.env) {
  return Object.fromEntries(['SystemRoot', 'WINDIR'].flatMap((key) => typeof environment[key] === 'string' && environment[key] ? [[key, environment[key]]] : []));
}
