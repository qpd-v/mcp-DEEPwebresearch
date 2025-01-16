import { ResearchSession } from './core/research-session.js';
import { ParallelSearch } from './parallel-search.js';
import { SearchQueue } from './search-queue.js';
import { SearchResult } from './types/session.js';

export interface DeepResearchOptions {
    maxDepth?: number;
    maxBranching?: number;
    timeout?: number;
    minRelevanceScore?: number;
    maxParallelOperations?: number;
}

export interface ResearchResult {
    sessionId: string;
    topic: string;
    findings: {
        mainTopics: Array<{
            name: string;
            importance: number;
            relatedTopics: string[];
        }>;
        keyInsights: Array<{
            text: string;
            confidence: number;
            relatedTopics: string[];
        }>;
        sources: Array<{
            url: string;
            title: string;
            credibilityScore: number;
        }>;
    };
    progress: {
        completedSteps: number;
        totalSteps: number;
        processedUrls: number;
    };
    timing: {
        started: string;
        completed?: string;
        duration?: number;
        operations?: {
            parallelSearch?: number;
            deduplication?: number;
            topResultsProcessing?: number;
            remainingResultsProcessing?: number;
            total?: number;
        };
    };
}

export class DeepResearch {
    public parallelSearch: ParallelSearch;
    private searchQueue: SearchQueue;
    private activeSessions: Map<string, ResearchSession>;

    constructor() {
        this.parallelSearch = new ParallelSearch();
        this.searchQueue = new SearchQueue();
        this.activeSessions = new Map();
    }

    private deduplicateResults(results: SearchResult[]): SearchResult[] {
        const seen = new Set<string>();
        return results.filter(result => {
            const normalizedUrl = this.normalizeUrl(result.url);
            if (seen.has(normalizedUrl)) {
                return false;
            }
            seen.add(normalizedUrl);
            return true;
        });
    }

    private normalizeUrl(url: string): string {
        try {
            // Remove protocol, www, trailing slashes, and query parameters
            return url
                .replace(/^https?:\/\//, '')
                .replace(/^www\./, '')
                .replace(/\/$/, '')
                .split('?')[0]
                .split('#')[0]
                .toLowerCase();
        } catch (error) {
            return url.toLowerCase();
        }
    }

    public async startResearch(topic: string, options: DeepResearchOptions = {}): Promise<ResearchResult> {
        const startTime = Date.now();
        const timings: { [key: string]: number } = {};

        console.log('[Performance] Starting research for topic:', topic);
        console.log('[Performance] Options:', options);

        // Create new research session
        const session = new ResearchSession(topic, {
            maxDepth: options.maxDepth,
            maxBranching: options.maxBranching,
            timeout: options.timeout,
            minRelevanceScore: options.minRelevanceScore,
            maxParallelOperations: options.maxParallelOperations
        });

        console.log('[Performance] Created research session:', session.id);
        this.activeSessions.set(session.id, session);

        try {
            console.log('[Performance] Starting parallel search...');
            const parallelSearchStart = Date.now();
            
            const queries = [
                topic,
                `${topic} tutorial`,
                `${topic} guide`,
                `${topic} example`,
                `${topic} implementation`,
                `${topic} code`,
                `${topic} design pattern`,
                `${topic} best practice`
            ];
            console.log('[Performance] Search queries:', queries);

            const searchResults = await this.parallelSearch.parallelSearch(queries);
            timings.parallelSearch = Date.now() - parallelSearchStart;
            console.log('[Performance] Parallel search complete. Duration:', timings.parallelSearch, 'ms');

            const deduplicationStart = Date.now();
            const allResults = searchResults.results.flatMap(result => result.results);
            console.log('[Performance] Total results:', allResults.length);

            const uniqueResults = this.deduplicateResults(allResults);
            console.log('[Performance] Unique results:', uniqueResults.length);

            const sortedResults = uniqueResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
            timings.deduplication = Date.now() - deduplicationStart;
            console.log('[Performance] Deduplication complete. Duration:', timings.deduplication, 'ms');

            // Process top results first
            console.log('[Performance] Processing top 5 results...');
            const topProcessingStart = Date.now();
            const topResults = sortedResults.slice(0, 5);
            await Promise.all(topResults.map(r => {
                console.log('[Performance] Processing URL:', r.url);
                return session.processUrl(r.url);
            }));
            timings.topResultsProcessing = Date.now() - topProcessingStart;
            console.log('[Performance] Top results processing complete. Duration:', timings.topResultsProcessing, 'ms');

            // Process remaining results
            console.log('[Performance] Processing remaining results...');
            const remainingProcessingStart = Date.now();
            const remainingResults = sortedResults.slice(5);
            await Promise.all(remainingResults.map(r => {
                console.log('[Performance] Processing URL:', r.url);
                return session.processUrl(r.url);
            }));
            timings.remainingResultsProcessing = Date.now() - remainingProcessingStart;
            console.log('[Performance] Remaining results processing complete. Duration:', timings.remainingResultsProcessing, 'ms');

            // Complete the session
            console.log('[Performance] Completing session...');
            await session.complete();

            // Format and return results
            console.log('[Performance] Formatting results...');
            const results = this.formatResults(session);
            
            // Add timing information
            timings.total = Date.now() - startTime;
            results.timing.operations = {
                parallelSearch: timings.parallelSearch,
                deduplication: timings.deduplication,
                topResultsProcessing: timings.topResultsProcessing,
                remainingResultsProcessing: timings.remainingResultsProcessing,
                total: timings.total
            };

            console.log('[Performance] Research complete. Total duration:', timings.total, 'ms');
            console.log('[Performance] Operation timings:', timings);

            return results;
        } catch (error) {
            console.error(`[Performance] Error in research session ${session.id}:`, error);
            throw error;
        } finally {
            // Cleanup
            this.activeSessions.delete(session.id);
            await this.parallelSearch.cleanup();
        }
    }

    private formatResults(session: ResearchSession): ResearchResult {
        return {
            sessionId: session.id,
            topic: session.topic,
            findings: {
                mainTopics: session.findings.mainTopics.map(topic => ({
                    name: topic.name,
                    importance: topic.importance,
                    relatedTopics: topic.relatedTopics
                })),
                keyInsights: session.findings.keyInsights.map(insight => ({
                    text: insight.text,
                    confidence: insight.confidence,
                    relatedTopics: insight.relatedTopics
                })),
                sources: session.findings.sources.map(source => ({
                    url: source.url,
                    title: source.title,
                    credibilityScore: source.credibilityScore
                }))
            },
            progress: {
                completedSteps: session.progress.completedSteps,
                totalSteps: session.progress.totalSteps,
                processedUrls: session.progress.visitedUrls.size
            },
            timing: {
                started: session.timestamp.created,
                completed: session.timestamp.completed,
                duration: session.timestamp.completed ?
                    new Date(session.timestamp.completed).getTime() - new Date(session.timestamp.created).getTime()
                    : undefined
            }
        };
    }

    public async getSessionStatus(sessionId: string): Promise<ResearchResult | null> {
        const session = this.activeSessions.get(sessionId);
        if (!session) return null;
        return this.formatResults(session);
    }
}

export default DeepResearch;