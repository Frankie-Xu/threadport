import { createJsonlSource, type SourceOptions } from './jsonl-source.js';
import { PARSER_VERSION } from './jsonl-reader.js';
export function createClaudeSource(options:SourceOptions){return createJsonlSource({...options,agent:'claude',parserVersion:PARSER_VERSION});}
