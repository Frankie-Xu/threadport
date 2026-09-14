import { expect,it } from 'vitest';
import { writeFile,access,realpath,unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { project,git,temporary } from '../helpers.js';
import { captureWorkspaceWithGit,captureWorkspace } from '../../src/workspace/snapshot.js';

it('projects actual raw HEAD/index/worktree changes without inventing historical facts',async()=>{
 const root=await realpath(await project());const binding={id:'w',projectId:'p',canonicalRoot:root};
 const clean=await captureWorkspaceWithGit(binding);expect(clean.git?.dirty).toBe(false);expect(clean.git?.changed_files).toEqual([]);
 expect(clean.git?.head).toBe(git(root,'rev-parse','HEAD').trim());expect(clean.git?.dirty_diff_hash).toBe(clean.snapshot.digest);
 await writeFile(join(root,'README.md'),'staged\n');git(root,'add','README.md');await writeFile(join(root,'README.md'),'unstaged\n');await writeFile(join(root,'new.txt'),'new\n');
 const dirty=await captureWorkspaceWithGit(binding);expect(dirty.git?.changed_files).toEqual(['README.md','new.txt']);expect(dirty.git?.dirty).toBe(true);expect(dirty.git?.branch).toBe('main');
 git(root,'checkout','--detach');const detached=await captureWorkspaceWithGit(binding);expect(detached.git?.detached).toBe(true);expect(detached.git?.branch).toBe('HEAD');
},30000);
it('never invokes repository filters or fsmonitor while projecting',async()=>{
 const root=await realpath(await project());const marker=join(root,'executed');
 await writeFile(join(root,'.gitattributes'),'*.md filter=hostile diff=hostile\n');
 git(root,'config','filter.hostile.clean','touch executed');git(root,'config','filter.hostile.process','touch executed');git(root,'config','filter.hostile.required','true');git(root,'config','diff.hostile.textconv','touch executed');git(root,'config','core.fsmonitor','touch executed');
 const result=await captureWorkspaceWithGit({id:'w',projectId:'p',canonicalRoot:root});
 expect(result.snapshot.incompleteReasons).toEqual([]);expect(result.git?.changed_files).toContain('.gitattributes');await expect(access(marker)).rejects.toThrow();
},30000);
it('does not manufacture a legacy Git projection for incomplete captures',async()=>{
 const root=await realpath(await temporary());git(root,'init');
 const result=await captureWorkspaceWithGit({id:'w',projectId:'p',canonicalRoot:root});expect(result.snapshot.incompleteReasons).toContain('NO_COMMIT');expect(result.git).toBeNull();
});

it('retains the original snapshot digest and detects deletions and empty added blobs',async()=>{
 const root=await realpath(await project());const binding={id:'w',projectId:'p',canonicalRoot:root};
 await writeFile(join(root,'empty'),'');git(root,'add','empty');git(root,'commit','-m','empty');
 const captured=await captureWorkspaceWithGit(binding);expect(captured.git?.dirty).toBe(false);
 expect(captured.snapshot.digest).toBe((await captureWorkspace(binding)).digest);
 await unlink(join(root,'README.md'));expect((await captureWorkspaceWithGit(binding)).git?.changed_files).toEqual(['README.md']);
 git(root,'add','-u');expect((await captureWorkspaceWithGit(binding)).git?.changed_files).toEqual(['README.md']);
},30000);
