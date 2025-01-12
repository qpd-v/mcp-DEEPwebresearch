export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

export interface ParallelSearchResult {
    searchId: string;
    query: string;
    results: SearchResult[];
    error?: string;
}

export interface SearchOptions {
    maxParallel?: number;
    delayBetweenSearches?: number;
    outputDir?: string;
    retryAttempts?: number;
}