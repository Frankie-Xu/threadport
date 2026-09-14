import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { chmod, lstat, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DomainError } from '../domain/errors.js';

export function applicationDataDir(options: { dataDir?: string; platform?: NodeJS.Platform; home?: string; env?: NodeJS.ProcessEnv } = {}): string {
  if (options.dataDir) return resolve(options.dataDir);
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir(); const env = options.env ?? process.env;
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'ThreadPort');
  if (platform === 'win32') {
    if (!env.LOCALAPPDATA) throw new DomainError('IO_FAILED', 'LOCALAPPDATA is unavailable; specify a data directory.');
    return join(env.LOCALAPPDATA, 'ThreadPort');
  }
  return join(env.XDG_DATA_HOME && isAbsolute(env.XDG_DATA_HOME) ? env.XDG_DATA_HOME : join(home, '.local', 'share'), 'threadport');
}

export async function privateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || (process.getuid && info.uid !== process.getuid())) {
    throw new DomainError('IO_FAILED', 'Unsafe application data directory.');
  }
  if (process.platform !== 'win32') await chmod(path, 0o700);
  else {
    // Check inherited Windows ACLs; chmod is not an ACL substitute.
    await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "$ErrorActionPreference='Stop'; $acl=Get-Acl -LiteralPath $env:THREADPORT_ACL_PATH; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $owner=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value; if($owner -ne $sid){exit 1}; foreach($r in $acl.Access){ $s=$r.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value; if($r.AccessControlType -eq 'Allow' -and $s -in @('S-1-1-0','S-1-5-11','S-1-5-32-545') -and (($r.FileSystemRights.value__ -band 278) -ne 0)){exit 1} }"],
      { env: { ...process.env, THREADPORT_ACL_PATH: path }, timeout: 10000, windowsHide: true });
  }
}
