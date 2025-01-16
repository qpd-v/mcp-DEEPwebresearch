import { ResearchSession as IResearchSession, ResearchPlan, ResearchStep, ResearchProgress, ResearchFindings, StepResult, SessionOptions, Evidence } from '../types/session.js';
import { ContentExtractor } from './content-extractor.js';
import { ContentAnalyzer } from './content-analyzer.js';
import { ExtractedContent } from '../types/content.js';
import { ContentAnalysis } from '../types/analysis.js';
import { chromium, Browser, BrowserContext } from 'playwright';
import { parse as parseUrl } from 'url';

export class ResearchSession implements IResearchSession {
    public id: string;
    public topic: string;
    public status: 'planning' | 'in_progress' | 'analyzing' | 'synthesizing' | 'completed' | 'failed' | 'cancelled';
    public plan: ResearchPlan;
    public progress: ResearchProgress;
    public findings: ResearchFindings;
    public timestamp: {
        created: string;
        updated: string;
        completed?: string;
    };

    private visitedUrls: Set<string>;
    private contentExtractor: ContentExtractor;
    private contentAnalyzer: ContentAnalyzer;
    private options: Required<SessionOptions>;
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private startTime: number;

    private checkTimeout(): void {
        const elapsed = Date.now() - this.startTime;
        if (elapsed >= this.options.timeout) {
            throw new Error('Research session timeout');
        }
    }

    constructor(topic: string, options: SessionOptions = {}) {
        this.id = `research_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.topic = topic;
        this.status = 'planning';
        this.visitedUrls = new Set<string>();
        this.contentExtractor = new ContentExtractor();
        this.contentAnalyzer = new ContentAnalyzer();
        this.startTime = Date.now();

        this.options = {
            maxSteps: options.maxSteps || 10,
            maxDepth: options.maxDepth || 2,
            maxBranching: options.maxBranching || 3,
            timeout: options.timeout || 55000, // Set below MCP timeout
            minRelevanceScore: options.minRelevanceScore || 0.7,
            maxParallelOperations: options.maxParallelOperations || 3
        };

        this.plan = this.createInitialPlan();
        this.progress = this.initializeProgress();
        this.findings = this.initializeFindings();
        this.timestamp = {
            created: new Date().toISOString(),
            updated: new Date().toISOString()
        };
    }

    private async initializeBrowser(): Promise<void> {
        if (!this.browser) {
            this.browser = await chromium.launch({ headless: true });
            this.context = await this.browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport: { width: 1280, height: 800 },
                deviceScaleFactor: 1,
                isMobile: false,
                hasTouch: false
            });
        }
    }

    private isProcessableUrl(url: string): boolean {
        try {
            const parsedUrl = parseUrl(url);
            const path = parsedUrl.pathname?.toLowerCase() || '';
            
            // Skip PDFs and other non-HTML content
            const skipExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
            if (skipExtensions.some(ext => path.endsWith(ext))) {
                console.error(`Skipping non-HTML content: ${url}`);
                return false;
            }

            return true;
        } catch (error) {
            console.error(`Invalid URL: ${url}`);
            return false;
        }
    }

    private async fetchContent(url: string): Promise<string> {
        this.checkTimeout();

        if (!this.isProcessableUrl(url)) {
            throw new Error(`Cannot process URL: ${url}`);
        }

        await this.initializeBrowser();
        if (!this.context) throw new Error('Browser context not initialized');

        const page = await this.context.newPage();
        try {
            // Navigate to the URL with a reduced timeout
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 10000 // 10 seconds max for page load
            });

            // Get the HTML content immediately without waiting for additional content
            const html = await page.content();
            return html;
        } catch (error) {
            console.error(`Error fetching content from ${url}:`, error);
            throw error;
        } finally {
            await page.close();
        }
    }

    public async processUrl(url: string, depth: number = 0): Promise<StepResult> {
        console.log(`Processing URL: ${url} at depth ${depth}`);
        
        if (this.visitedUrls.has(url)) {
            console.log(`URL already visited: ${url}`);
            return { searchResults: [] };
        }

        try {
            console.log('Fetching content...');
            const htmlContent = await this.fetchContent(url);
            console.log('Content fetched, length:', htmlContent.length);

            console.log('Extracting content...');
            const content = await this.contentExtractor.extract(htmlContent, url);
            console.log('Content extracted, title:', content.title);
            this.visitedUrls.add(url);

            console.log('Analyzing content...');
            const analysis = await this.contentAnalyzer.analyze(content);
            console.log('Analysis complete:', {
                topics: analysis.topics.length,
                keyPoints: analysis.keyPoints.length,
                relevanceScore: analysis.relevanceScore
            });

            // Update progress
            this.progress.processedContent++;
            this.progress.visitedUrls.add(url);
            this.updateTimestamp();

            console.log('Processing findings...');
            await this.processFindings(content, analysis, depth);
            console.log('Findings processed');

            const result = {
                searchResults: [{
                    url,
                    title: content.title,
                    snippet: content.content.substring(0, 200),
                    relevanceScore: analysis.relevanceScore
                }],
                extractedContents: [content],
                analysis
            };

            console.log('URL processing complete:', {
                title: content.title,
                contentLength: content.content.length,
                relevanceScore: analysis.relevanceScore
            });

            return result;
        } catch (error) {
            console.error(`Error processing URL ${url}:`, error);
            return { searchResults: [] };
        }
    }

    private createInitialPlan(): ResearchPlan {
        return {
            steps: [],
            estimatedTime: 0,
            maxDepth: this.options.maxDepth,
            maxBranching: this.options.maxBranching,
            focusAreas: []
        };
    }

    private initializeProgress(): ResearchProgress {
        return {
            completedSteps: 0,
            totalSteps: 0,
            visitedUrls: new Set<string>(),
            processedContent: 0,
            startTime: new Date().toISOString()
        };
    }

    private initializeFindings(): ResearchFindings {
        return {
            mainTopics: [],
            keyInsights: [],
            sources: []
        };
    }

    private async processFindings(content: ExtractedContent, analysis: ContentAnalysis, depth: number): Promise<void> {
        console.log('Processing findings for:', content.url);
        
        try {
            // Extract code blocks and technical sections first
            console.log('Extracting code blocks and technical sections...');
            const codeBlocks = this.extractCodeBlocks(content.content);
            const technicalSections = this.extractTechnicalSections(content.content);
            console.log('Found:', {
                codeBlocks: codeBlocks.length,
                technicalSections: technicalSections.length
            });

            // Update main topics with higher weight for technical content
            console.log('Updating topics...');
            console.log('Before update - Topics:', this.findings.mainTopics.length);
            this.updateTopics(analysis, technicalSections);
            console.log('After update - Topics:', this.findings.mainTopics.length);

            // Update key insights with code examples
            console.log('Updating insights...');
            console.log('Before update - Insights:', this.findings.keyInsights.length);
            this.updateInsights(analysis, codeBlocks, technicalSections);
            console.log('After update - Insights:', this.findings.keyInsights.length);

            // Update sources with technical content score
            console.log('Updating sources...');
            console.log('Before update - Sources:', this.findings.sources.length);
            this.updateSources(content, analysis, technicalSections.length > 0);
            console.log('After update - Sources:', this.findings.sources.length);

            // Process related URLs if within depth limit
            if (depth < this.options.maxDepth) {
                console.log(`Processing related URLs at depth ${depth}...`);
                await this.processRelatedUrls(content, depth + 1);
            } else {
                console.log(`Max depth ${this.options.maxDepth} reached, skipping related URLs`);
            }

            console.log('Findings processing complete');
        } catch (error) {
            console.error('Error processing findings:', error);
        }
    }

    private extractCodeBlocks(content: string): string[] {
        const blocks: string[] = [];
        // Match both fenced code blocks and inline code
        const codeRegex = /```[\s\S]*?```|`[^`]+`/g;
        let match;
        
        while ((match = codeRegex.exec(content)) !== null) {
            blocks.push(match[0]);
        }
        
        return blocks;
    }

    private extractTechnicalSections(content: string): string[] {
        const sections: string[] = [];
        const technicalIndicators = [
            'implementation',
            'example',
            'usage',
            'code',
            'method',
            'function',
            'class',
            'pattern',
            'practice'
        ];

        // Split content into paragraphs
        const paragraphs = content.split(/\n\n+/);
        
        // Find paragraphs containing technical content
        paragraphs.forEach(paragraph => {
            const lowerParagraph = paragraph.toLowerCase();
            if (
                technicalIndicators.some(indicator => lowerParagraph.includes(indicator)) ||
                paragraph.includes('```') ||
                /`[^`]+`/.test(paragraph)
            ) {
                sections.push(paragraph);
            }
        });

        return sections;
    }

    private updateTopics(analysis: ContentAnalysis, technicalSections: string[]): void {
        console.log('Updating topics with analysis:', {
            topicsCount: analysis.topics ? analysis.topics.length : 0,
            technicalSectionsCount: technicalSections.length
        });

        if (!analysis.topics || analysis.topics.length === 0) {
            console.log('No topics found in analysis');
            return;
        }

        analysis.topics.forEach(topic => {
            console.log('Processing topic:', {
                name: topic.name,
                confidence: topic.confidence
            });

            const existingTopic = this.findings.mainTopics.find(t => t.name === topic.name);
            const hasTechnicalContent = technicalSections.some(section =>
                section.toLowerCase().includes(topic.name.toLowerCase())
            );

            const adjustedConfidence = hasTechnicalContent ?
                Math.min(1, topic.confidence * 1.3) :
                topic.confidence;

            console.log('Topic analysis:', {
                hasTechnicalContent,
                originalConfidence: topic.confidence,
                adjustedConfidence
            });

            if (existingTopic) {
                console.log('Updating existing topic:', existingTopic.name);
                existingTopic.importance = Math.max(existingTopic.importance, adjustedConfidence);
            } else {
                console.log('Adding new topic:', topic.name);
                this.findings.mainTopics.push({
                    name: topic.name,
                    importance: adjustedConfidence,
                    relatedTopics: [],
                    evidence: []
                });
            }
        });

        // Sort topics by importance
        this.findings.mainTopics.sort((a, b) => b.importance - a.importance);
        console.log('Updated topics count:', this.findings.mainTopics.length);
    }

    private updateInsights(analysis: ContentAnalysis, codeBlocks: string[], technicalSections: string[]): void {
        analysis.keyPoints.forEach(point => {
            // Find related code examples
            const relatedCode = codeBlocks.filter(code =>
                this.isCodeRelatedToPoint(code, point.text)
            );

            // Find related technical sections
            const relatedTechnical = technicalSections.filter(section =>
                this.isSectionRelatedToPoint(section, point.text)
            );

            // Adjust confidence based on technical content
            let adjustedConfidence = point.importance;
            if (relatedCode.length > 0) adjustedConfidence *= 1.2;
            if (relatedTechnical.length > 0) adjustedConfidence *= 1.1;

            if (adjustedConfidence >= this.options.minRelevanceScore) {
                // Convert code blocks and technical sections to Evidence objects
                const evidence: Evidence[] = [
                    ...relatedCode.map(code => ({
                        claim: "Code example supporting the insight",
                        sources: [code],
                        confidence: 0.9
                    })),
                    ...relatedTechnical.map(section => ({
                        claim: "Technical documentation supporting the insight",
                        sources: [section],
                        confidence: 0.8
                    }))
                ];

                this.findings.keyInsights.push({
                    text: point.text,
                    confidence: Math.min(1, adjustedConfidence),
                    supportingEvidence: evidence,
                    relatedTopics: point.topics
                });
            }
        });

        // Sort insights by confidence
        this.findings.keyInsights.sort((a, b) => b.confidence - a.confidence);
    }

    private updateSources(content: ExtractedContent, analysis: ContentAnalysis, hasTechnicalContent: boolean): void {
        const source = {
            url: content.url,
            title: content.title,
            credibilityScore: hasTechnicalContent ?
                Math.min(1, analysis.quality.credibilityScore * 1.2) :
                analysis.quality.credibilityScore,
            contributedFindings: analysis.keyPoints.map(point => point.text)
        };

        const existingSource = this.findings.sources.find(s => s.url === content.url);
        if (!existingSource) {
            this.findings.sources.push(source);
        }
    }

    private isCodeRelatedToPoint(code: string, point: string): boolean {
        const codeTerms = new Set(code.toLowerCase().split(/\W+/));
        const pointTerms = new Set(point.toLowerCase().split(/\W+/));
        
        // Check for common terms
        const intersection = [...pointTerms].filter(term => codeTerms.has(term));
        return intersection.length >= 2; // At least 2 common terms
    }

    private isSectionRelatedToPoint(section: string, point: string): boolean {
        const sectionLower = section.toLowerCase();
        const pointLower = point.toLowerCase();
        
        // Check for significant term overlap
        const sectionTerms = new Set(sectionLower.split(/\W+/));
        const pointTerms = new Set(pointLower.split(/\W+/));
        const intersection = [...pointTerms].filter(term => sectionTerms.has(term));
        
        return intersection.length >= 3 || // At least 3 common terms
               sectionLower.includes(pointLower) || // Contains the entire point
               pointLower.includes(sectionLower); // Point contains the section
    }

    private async processRelatedUrls(content: ExtractedContent, depth: number): Promise<void> {
        // Extract URLs from content and process them
        // This would be implemented to handle actual URL extraction and processing
    }

    private updateTimestamp(): void {
        this.timestamp.updated = new Date().toISOString();
    }

    public async complete(): Promise<void> {
        this.status = 'completed';
        this.timestamp.completed = new Date().toISOString();

        // Cleanup browser
        if (this.context) {
            await this.context.close();
            this.context = null;
        }
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}