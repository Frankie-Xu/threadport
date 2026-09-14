import type { SqliteStore } from '../storage/sqlite-store.js';
import type { SearchInput, SearchPage } from './contracts.js';
export type { SearchInput, SearchPage, SearchItem, SearchMatch } from './contracts.js';
/** Deterministic literal search. Restart with no cursor after SEARCH_STALE. */
export class SearchService {
 constructor(private readonly store:Pick<SqliteStore,'searchHistory'>){}
 async search(input:SearchInput={}):Promise<SearchPage>{return this.store.searchHistory(input);}
}
