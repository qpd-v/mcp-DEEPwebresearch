export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

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
    executionTime?: number;
}

export interface SearchOptions {
    maxParallel?: number;
    delayBetweenSearches?: number;
    outputDir?: string;
    retryAttempts?: number;
    includeTimings?: boolean;
}

export interface SearchSummary {
    totalQueries: number;
    successful: number;
    failed: number;
    totalExecutionTime?: number;
    averageExecutionTime?: number;
}

export interface SearchOptions {
    maxParallel?: number;
    delayBetweenSearches?: number;
    outputDir?: string;
    retryAttempts?: number;
}