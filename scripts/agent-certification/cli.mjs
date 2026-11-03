import { pathToFileURL } from 'node:url';
import { drift, judge, prepare, validate } from './harness.mjs';
import { HarnessError, jsonBytes, requireInput } from './io.mjs';

const help = `ThreadPort CERT-01 developer harness (Node 24; no Agent execution)
node scripts/agent-certification/cli.mjs prepare --dir <new-directory> --scenario A|B|C --candidate <40-hex-sha> --tarball <file.tgz> --source-agent claude|codex --source-version <exact-semver> --target-agent claude|codex --target-version <exact-semver> --mode native-resume|new-session
node scripts/agent-certification/cli.mjs judge --dir <directory> --phase baseline|final
node scripts/agent-certification/cli.mjs drift --dir <C-directory>
node scripts/agent-certification/cli.mjs validate --dir <directory> --evidence <relative.json> --candidate <expected-sha> --tarball <expected-file.tgz>
Exit: 0 prepared/satisfied/complete-unverified/help; 1 unsatisfied artifacts; 2 invalid/unsafe input or binding; 3 valid but incomplete/unverified observations.
No record establishes authenticity, receipt attestation, authority, responsibility or verified completion.
`;
const flags = {
  prepare: ['dir', 'scenario', 'candidate', 'tarball', 'source-agent', 'source-version', 'target-agent', 'target-version', 'mode'],
  judge: ['dir', 'phase'], drift: ['dir'], validate: ['dir', 'evidence', 'candidate', 'tarball'],
};
export async function main(argv, io = process) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === '--help')) { io.stdout.write(help); return 0; }
  try {
    const [command, ...args] = argv;
    requireInput(Object.hasOwn(flags, command) && args.length === flags[command].length * 2, 'INVALID_ARGUMENTS');
    const options = Object.create(null);
    for (let i = 0; i < args.length; i += 2) {
      const name = args[i].slice(2);
      requireInput(args[i].startsWith('--') && flags[command].includes(name) && !Object.hasOwn(options, name)
        && args[i + 1].length > 0 && args[i + 1].length <= 4096 && !args[i + 1].includes('\0'), 'INVALID_ARGUMENTS');
      options[name] = args[i + 1];
    }
    requireInput(flags[command].every(name => Object.hasOwn(options, name)), 'INVALID_ARGUMENTS');
    requireInput(process.versions.node.split('.')[0] === '24', 'NODE_24_REQUIRED');
    const result = command === 'prepare' ? await prepare(options) : command === 'judge' ? await judge(options.dir, options.phase)
      : command === 'drift' ? await drift(options.dir) : await validate(options);
    io.stdout.write(jsonBytes(result));
    if (command === 'judge') return result.status === 'satisfied' ? 0 : 1;
    if (command === 'validate') return result.state === 'complete-unverified' ? 0 : result.state === 'artifact-failed' ? 1 : 3;
    return 0;
  } catch (error) {
    io.stderr.write(jsonBytes({ error: error instanceof HarnessError ? error.code : 'IO_FAILED' }));
    return 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main(process.argv.slice(2));
