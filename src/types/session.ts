import { ExtractedContent } from './content';
import { ContentAnalysis } from './analysis';

export interface ResearchSession {
    id: string;
    topic: string;
    status: ResearchStatus;
    plan: ResearchPlan;
    progress: ResearchProgress;
    findings: ResearchFindings;
    timestamp: {
        created: string;
        updated: string;
        completed?: string;
    };
}

export type ResearchStatus = 
    | 'planning'
    | 'in_progress'
    | 'analyzing'
    | 'synthesizing'
    | 'completed'
    | 'failed'
    | 'cancelled';

export interface ResearchPlan {
    steps: ResearchStep[];
    estimatedTime: number;
    maxDepth: number;
    maxBranching: number;
    focusAreas: string[];
}

export interface ResearchStep {
    id: string;
    type: StepType;
    status: StepStatus;
    query: string;
    dependsOn: string[];
    refinements: string[];
    results: StepResult;
    timing: {
        started?: string;
        completed?: string;
        duration?: number;
    };
}

export type StepType = 
    | 'initial_search'
    | 'follow_up_search'
    | 'content_extraction'
    | 'analysis'
    | 'synthesis';

export type StepStatus = 
    | 'pending'
    | 'in_progress'
    | 'completed'
    | 'failed'
    | 'skipped';

export interface StepResult {
    searchResults?: SearchResult[];
    extractedContents?: ExtractedContent[];
    analysis?: ContentAnalysis;
    synthesis?: SynthesisResult;
}

export interface SearchResult {
    url: string;
    title: string;
    snippet: string;
    relevanceScore: number;
}

export interface SynthesisResult {
    summary: string;
    keyFindings: string[];
    relationships: RelationshipMap;
    evidence: Evidence[];
}

export interface RelationshipMap {
    nodes: Node[];
    edges: Edge[];
}

export interface Node {
    id: string;
    type: string;
    label: string;
    properties: Record<string, any>;
}

export interface Edge {
    source: string;
    target: string;
    type: string;
    properties: Record<string, any>;
}

export interface Evidence {
    claim: string;
    sources: string[];
    confidence: number;
}

export interface ResearchProgress {
    completedSteps: number;
    totalSteps: number;
    currentStep?: string;
    visitedUrls: Set<string>;
    processedContent: number;
    startTime: string;
    estimatedCompletion?: string;
}

export interface ResearchFindings {
    mainTopics: Topic[];
    keyInsights: KeyInsight[];
    timeline?: TimelineEvent[];
    sources: Source[];
}

export interface Topic {
    name: string;
    importance: number;
    relatedTopics: string[];
    evidence: Evidence[];
}

export interface KeyInsight {
    text: string;
    confidence: number;
    supportingEvidence: Evidence[];
    relatedTopics: string[];
}

export interface TimelineEvent {
    date: string;
    description: string;
    importance: number;
    sources: string[];
}

export interface Source {
    url: string;
    title: string;
    credibilityScore: number;
    contributedFindings: string[];
}

export interface SessionOptions {
    maxSteps?: number;
    maxDepth?: number;
    maxBranching?: number;
    timeout?: number;
    minRelevanceScore?: number;
    maxParallelOperations?: number;
}