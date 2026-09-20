import { publicText } from '../privacy.js';
import type { AssertionView } from './contracts.js';
/** Redact every user-controlled display string; references and history remain structured metadata. */
export const assertionDto=(entry:AssertionView):AssertionView=>({...entry,text:publicText(entry.text),topic:publicText(entry.topic),scope:{...entry.scope,path:entry.scope.path?publicText(entry.scope.path):null}});
export const assertionText=(entry:AssertionView)=>`${entry.scope.path?`[Path ${publicText(entry.scope.path)}] `:''}${publicText(entry.text)}`;
