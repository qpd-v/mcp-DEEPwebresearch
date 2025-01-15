export interface ExtractedContent {
    url: string;
    title: string;
    content: string;
    html?: string;
    timestamp: string;
    metadata: ContentMetadata;
    structuredData?: any[];
}

export interface ContentMetadata {
    author?: string;
    datePublished?: string;
    lastModified?: string;
    language?: string;
    readingTime?: number;
    wordCount?: number;
}

export interface ContentSection {
    id: string;
    title?: string;
    content: string;
    importance: number;
    type: 'main' | 'technical' | 'sidebar' | 'header' | 'footer' | 'navigation' | 'other';
}

export interface StructuredContent {
    mainContent: ContentSection[];
    relatedLinks: string[];
    images: ImageContent[];
    tables: TableContent[];
}

export interface ImageContent {
    url: string;
    alt?: string;
    caption?: string;
    dimensions?: {
        width: number;
        height: number;
    };
}

export interface TableContent {
    headers: string[];
    rows: string[][];
    caption?: string;
}

export interface ContentExtractionOptions {
    includeHtml?: boolean;
    extractStructuredData?: boolean;
    extractImages?: boolean;
    extractTables?: boolean;
    maxContentLength?: number;
    timeout?: number;
}