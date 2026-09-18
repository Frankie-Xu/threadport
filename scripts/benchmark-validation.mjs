/** Validate that every measured search request produced exactly one stage sample. */
export function validateSearchTimings(samples, expected){
 const ids=new Set(),duplicates=[];
 for(const sample of samples){if(ids.has(sample.id))duplicates.push(sample.id);ids.add(sample.id);}
 return {expected,observed:samples.length,uniqueIds:ids.size,duplicateIds:[...new Set(duplicates)],valid:samples.length===expected&&ids.size===expected&&duplicates.length===0};
}
