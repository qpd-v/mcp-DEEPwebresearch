import { ResearchSession } from './core/research-session.js';
import { ParallelSearch } from './parallel-search.js';
import { SearchQueue } from './search-queue.js';

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
            // Perform initial search
            const searchResults = await this.parallelSearch.parallelSearch([
                topic,
                `${topic} overview`,
                `${topic} analysis`,
                `${topic} research`
            ]);

            // Process each search result
            const processPromises = searchResults.results.flatMap(result =>
                result.results.map(r => session.processUrl(r.url))
            );

            // Wait for initial processing to complete
            await Promise.all(processPromises);

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