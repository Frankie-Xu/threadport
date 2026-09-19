/** Versioned, conservative filename policy. This does not detect secrets in arbitrary source files. */
export const WORKSPACE_POLICY='threadport.workspace.scope.v1' as const;
export const WORKSPACE_ALGORITHM='threadport.workspace.raw.v2' as const;
export function sensitivePath(path:string):boolean{
 const parts=path.toLowerCase().split(/[\\/]/);const name=parts.at(-1)!;
 return parts.some(part=>['.ssh','.aws','.gnupg'].includes(part))||/^\.env(?:\.|$)/.test(name)||/^(?:credentials|secrets?)(?:\.|$)/.test(name)||/\.(?:key|pem|p12|pfx)$/.test(name)||['.npmrc','.netrc','.pypirc','id_rsa','id_dsa','id_ecdsa','id_ed25519'].includes(name);
}
