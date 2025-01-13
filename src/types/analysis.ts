export interface Topic {
    name: string;
    confidence: number;
    keywords: string[];
}

export interface KeyPoint {
    text: string;
    importance: number;
    topics: string[];
    supportingEvidence: string[];
}

export type EntityType = 'standard' | 'algorithm' | 'organization' | 'person' | 'technology';

export interface EntityMention {
    text: string;
    position: {
        start: number;
        end: number;
    };
    context: string;
}

export interface Entity {
    name: string;
    type: EntityType;
    mentions: EntityMention[];
}

export interface Relationship {
    source: string;
    target: string;
    type: string;
    confidence: number;
}

export interface Citation {
    text: string;
    type: 'standard' | 'url' | 'reference';
    source?: string;
}

export interface SentimentAnalysis {
    score: number;
    confidence: number;
    aspects: Array<{
        aspect: string;
        score: number;
    }>;
}

export interface ContentQuality {
    readability: number;
    informationDensity: number;
    technicalDepth: number;
    credibilityScore: number;
    freshness: number;
}

export interface ContentAnalysis {
    relevanceScore: number;
    topics: Topic[];
    keyPoints: KeyPoint[];
    entities: Entity[];
    sentiment: SentimentAnalysis;
    relationships: Relationship[];
    citations: Citation[];
    quality: ContentQuality;
}

export interface AnalysisOptions {
    maxTopics?: number;
    maxKeyPoints?: number;
    minConfidence?: number;
    minImportance?: number;
    includeSentiment?: boolean;
    includeRelationships?: boolean;
    includeCitations?: boolean;
}