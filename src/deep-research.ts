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
        // Create new research session
        const session = new ResearchSession(topic, {
            maxDepth: options.maxDepth,
            maxBranching: options.maxBranching,
            timeout: options.timeout,
            minRelevanceScore: options.minRelevanceScore,
            maxParallelOperations: options.maxParallelOperations
        });

        this.activeSessions.set(session.id, session);

        try {
            // Perform initial search with more targeted queries
            const searchResults = await this.parallelSearch.parallelSearch([
                topic,
                `${topic} tutorial`,
                `${topic} guide`,
                `${topic} example`,
                `${topic} implementation`,
                `${topic} code`,
                `${topic} design pattern`,
                `${topic} best practice`
            ]);

            // Filter and sort results by relevance
            const allResults = searchResults.results.flatMap(result => result.results);
            const uniqueResults = this.deduplicateResults(allResults);
            const sortedResults = uniqueResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

            // Process top results first
            const topResults = sortedResults.slice(0, 5);
            await Promise.all(topResults.map(r => session.processUrl(r.url)));

            // Process remaining results
            const remainingResults = sortedResults.slice(5);
            await Promise.all(remainingResults.map(r => session.processUrl(r.url)));

            // Complete the session
            await session.complete();

            // Return formatted results
            return this.formatResults(session);
        } catch (error) {
            console.error(`Error in research session ${session.id}:`, error);
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