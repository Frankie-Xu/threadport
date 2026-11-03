import { publicText } from '../privacy.js';

/** Only public evidence fields enter search, including during cache upgrades. */
export function eventSearchText(value: unknown, fallback = ''): string {
  const event = value && typeof value==='object' && !Array.isArray(value) ? value : {};
  const text = 'text' in event && typeof event.text==='string' ? event.text : fallback;
  const paths: unknown[] = 'relativePaths' in event && Array.isArray(event.relativePaths) ? event.relativePaths : [];
  const run = 'commandRun' in event && event.commandRun && typeof event.commandRun==='object' ? event.commandRun : null;
  const command = run && 'command' in run && typeof run.command==='string' ? run.command : '';
  return [text,...paths.filter((path):path is string=>typeof path==='string'),command]
    .filter(Boolean).map(publicText).join('\n');
}
