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

    constructor(topic: string, options: SessionOptions = {}) {
        this.id = `research_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.topic = topic;
        this.status = 'planning';
        this.visitedUrls = new Set<string>();
        this.contentExtractor = new ContentExtractor();
        this.contentAnalyzer = new ContentAnalyzer();

        this.options = {
            maxSteps: options.maxSteps || 10,
            maxDepth: options.maxDepth || 3,
            maxBranching: options.maxBranching || 5,
            timeout: options.timeout || 300000, // 5 minutes
            minRelevanceScore: options.minRelevanceScore || 0.5,
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
        if (!this.isProcessableUrl(url)) {
            throw new Error(`Cannot process URL: ${url}`);
        }

        await this.initializeBrowser();
        if (!this.context) throw new Error('Browser context not initialized');

        const page = await this.context.newPage();
        try {
            // Add random delay between requests (1-3 seconds)
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

            // Navigate to the URL with a timeout
            await page.goto(url, {
                waitUntil: 'networkidle',
                timeout: 30000
            });

            // Wait for content to load
            await page.waitForLoadState('domcontentloaded');

            // Wait for dynamic content
            await page.waitForTimeout(2000); // Allow time for dynamic content to load

            // Wait for specific technical content selectors
            const technicalSelectors = [
                'pre', 'code',
                '.technical-content',
                '.documentation',
                '.markdown-body',
                '.post-content',
                'article'
            ];

            for (const selector of technicalSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 5000 });
                } catch (e) {
                    // Ignore if selector not found
                }
            }

            // Expand any "show more" or similar buttons
            const expandButtons = [
                'button:has-text("show more")',
                'button:has-text("read more")',
                'button:has-text("expand")',
                '.expand-button',
                '.show-more'
            ];

            for (const buttonSelector of expandButtons) {
                try {
                    const buttons = await page.$$(buttonSelector);
                    for (const button of buttons) {
                        await button.click().catch(() => {}); // Ignore click errors
                    }
                } catch (e) {
                    // Ignore if no buttons found
                }
            }

            // Wait a bit for any expanded content
            await page.waitForTimeout(1000);

            // Get the full HTML content
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
        if (this.visitedUrls.has(url)) {
            return { searchResults: [] };
        }

        try {
            // Extract content from URL
            const content = await this.contentExtractor.extract(await this.fetchContent(url), url);
            this.visitedUrls.add(url);

            // Analyze content
            const analysis = await this.contentAnalyzer.analyze(content);

            // Update progress
            this.progress.processedContent++;
            this.progress.visitedUrls.add(url);
            this.updateTimestamp();

            // Process findings
            await this.processFindings(content, analysis, depth);

            return {
                searchResults: [{ 
                    url, 
                    title: content.title, 
                    snippet: content.content.substring(0, 200), 
                    relevanceScore: analysis.relevanceScore 
                }],
                extractedContents: [content],
                analysis
            };
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
        try {
            // Extract code blocks and technical sections first
            const codeBlocks = this.extractCodeBlocks(content.content);
            const technicalSections = this.extractTechnicalSections(content.content);

            // Update main topics with higher weight for technical content
            this.updateTopics(analysis, technicalSections);

            // Update key insights with code examples
            this.updateInsights(analysis, codeBlocks, technicalSections);

            // Update sources with technical content score
            this.updateSources(content, analysis, technicalSections.length > 0);

            // Process related URLs if within depth limit
            if (depth < this.options.maxDepth) {
                await this.processRelatedUrls(content, depth + 1);
            }
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
        analysis.topics.forEach(topic => {
            const existingTopic = this.findings.mainTopics.find(t => t.name === topic.name);
            const hasTechnicalContent = technicalSections.some(section =>
                section.toLowerCase().includes(topic.name.toLowerCase())
            );

            const adjustedConfidence = hasTechnicalContent ?
                Math.min(1, topic.confidence * 1.3) :
                topic.confidence;

            if (existingTopic) {
                existingTopic.importance = Math.max(existingTopic.importance, adjustedConfidence);
            } else {
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