import { expect, it } from 'vitest';
import { mergeCoverage, type Coverage, type CoverageReport } from '../../src/control-plane/coverage.js';
const report=(coverage:Coverage):CoverageReport=>({sourceId:'source',parserVersion:'test',coverage,fields:[],gaps:[],warnings:[]});
it.each([
 [['full','full'],'full'],[['full','partial'],'partial'],[['full','unknown'],'unknown'],[['partial','unknown'],'unknown'],[['unknown','none'],'none'],[['partial','none'],'none'],
] as [Coverage[],Coverage][])('preserves uncertainty when merging %j', (levels,expected)=>{
 expect(mergeCoverage(levels.map(report)).coverage).toBe(expected);
 expect(mergeCoverage([...levels].reverse().map(report)).coverage).toBe(expected);
});
