import { ZodError } from 'zod';
import { DomainError } from './domain/errors.js';

export function parseControlOptions(args:readonly string[],allowed:readonly string[],required:readonly string[]):Record<string,string>{
 const values:Record<string,string>={};
 for(let index=0;index<args.length;index+=2){
  const key=args[index],value=args[index+1];
  if(!allowed.includes(key)||Object.hasOwn(values,key)||!value||value.startsWith('--')||value.includes('\0')||value.length>32768)throw new DomainError('INVALID_INPUT','Invalid control command arguments.');
  values[key]=value;
 }
 if(required.some(key=>!Object.hasOwn(values,key)))throw new DomainError('INVALID_INPUT','Missing required control command argument.');
 return values;
}

export function controlExitCode(error:unknown):number{
 if(error instanceof ZodError||error instanceof SyntaxError)return 2;
 if(!(error instanceof DomainError))return 5;
 if(error.code==='INVALID_INPUT'||error.code==='NOT_FOUND')return 2;
 if(error.code==='IO_FAILED'||error.code==='MIGRATION_FAILED')return 5;
 return 4;
}
