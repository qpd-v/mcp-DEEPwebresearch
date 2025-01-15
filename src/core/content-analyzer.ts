import natural from 'natural';
import { ContentAnalysis, Topic, KeyPoint, Entity, EntityType, EntityMention, Relationship, Citation, ContentQuality, AnalysisOptions } from '../types/analysis.js';
import { ExtractedContent } from '../types/content.js';

export class ContentAnalyzer {
    private tokenizer: natural.WordTokenizer;
    private tfidf: natural.TfIdf;
    private stemmer: typeof natural.PorterStemmerFr;
    private technicalTerms: Set<string>;
    private boilerplatePatterns: RegExp[];
    
    constructor() {
        this.tokenizer = new natural.WordTokenizer();
        this.tfidf = new natural.TfIdf();
        this.stemmer = natural.PorterStemmerFr;
        
        // Initialize technical terms focused on API wrappers and programming
        this.technicalTerms = new Set([
            // API and Design Patterns
            'api', 'wrapper', 'client', 'sdk', 'library', 'interface',
            'endpoint', 'request', 'response', 'http', 'rest', 'soap',
            'facade', 'adapter', 'proxy', 'decorator', 'factory',
            
            // Implementation Concepts
            'implementation', 'method', 'function', 'class', 'object',
            'parameter', 'argument', 'return', 'async', 'await', 'promise',
            'callback', 'error', 'exception', 'handler', 'middleware',
            
            // Best Practices
            'pattern', 'practice', 'standard', 'convention', 'principle',
            'solid', 'dry', 'separation', 'concern', 'abstraction',
            'encapsulation', 'inheritance', 'polymorphism',
            
            // Testing and Quality
            'test', 'mock', 'stub', 'assertion', 'coverage', 'unit',
            'integration', 'validation', 'verification', 'documentation',
            
            // Common Features
            'authentication', 'authorization', 'security', 'cache',
            'rate', 'limit', 'throttle', 'retry', 'timeout', 'logging'
        ]);

        // Initialize boilerplate patterns
        this.boilerplatePatterns = [
            /copyright/i,
            /all rights reserved/i,
            /terms of service/i,
            /privacy policy/i,
            /cookie policy/i,
            /contact us/i,
            /about us/i,
            /follow us/i,
            /subscribe/i,
            /sign up/i,
            /log in/i,
            /register/i
        ];
    }

    public async analyze(content: ExtractedContent, options: AnalysisOptions = {}): Promise<ContentAnalysis> {
        console.log('Starting content analysis for URL:', content.url);
        console.log('Content length:', content.content.length);

        // Prepare content for analysis
        const tokens = this.tokenizeContent(content.content);
        this.tfidf.addDocument(tokens);
        console.log('Tokenized content length:', tokens.length);

        // Extract topics and calculate relevance
        console.log('Extracting topics...');
        const topics = await this.extractTopics(content, options);
        console.log('Found topics:', topics.length, topics.map(t => t.name));

        console.log('Extracting key points...');
        const keyPoints = this.extractKeyPoints(content, topics, options);
        console.log('Found key points:', keyPoints.length);

        console.log('Extracting entities...');
        const entities = this.extractEntities(content);
        console.log('Found entities:', entities.length);

        const relationships = this.findRelationships(entities, content);
        const sentiment = this.analyzeSentiment(content.content);
        const quality = this.assessQuality(content);

        // Merge similar topics
        console.log('Merging similar topics...');
        const mergedTopics = this.mergeSimilarTopics(topics);
        console.log('After merging:', mergedTopics.length, mergedTopics.map(t => t.name));

        const result = {
            relevanceScore: this.calculateRelevanceScore(content, mergedTopics),
            topics: mergedTopics,
            keyPoints: this.deduplicateKeyPoints(keyPoints),
            entities,
            sentiment,
            relationships,
            citations: this.extractCitations(content),
            quality
        };

        console.log('Analysis complete. Topics:', result.topics.length);
        console.log('Key points:', result.keyPoints.length);
        console.log('Relevance score:', result.relevanceScore);

        return result;
    }

    private tokenizeContent(text: string): string[] {
        return this.tokenizer.tokenize(text.toLowerCase()) || [];
    }

    private async extractTopics(content: ExtractedContent, options: AnalysisOptions): Promise<Topic[]> {
        const maxTopics = options.maxTopics || 8;
        const minConfidence = options.minConfidence || 0.15; // Lowered threshold

        // Split content into sections
        const sections = content.content.split(/\n\n+/);
        
        // Initialize topic tracking
        const topicMentions = new Map<string, {
            count: number,
            contexts: string[],
            keywords: Set<string>
        }>();

        // Analyze each section
        sections.forEach(section => {
            const sectionLower = section.toLowerCase();
            
            // Look for topic indicators
            const topicIndicators = [
                { pattern: /(?:using|implementing|creating)\s+(\w+(?:\s+\w+){0,2})\s+(?:pattern|approach|method)/i, weight: 1.2 },
                { pattern: /(?:best\s+practice|recommended)\s+(?:is|for)\s+(\w+(?:\s+\w+){0,2})/i, weight: 1.1 },
                { pattern: /(\w+(?:\s+\w+){0,2})\s+implementation/i, weight: 1.0 },
                { pattern: /(\w+(?:\s+\w+){0,2})\s+(?:wrapper|api|interface)/i, weight: 1.0 }
            ];

            topicIndicators.forEach(({ pattern, weight }) => {
                const matches = sectionLower.match(pattern);
                if (matches && matches[1]) {
                    const topic = matches[1].trim();
                    const existing = topicMentions.get(topic) || { count: 0, contexts: [], keywords: new Set() };
                    existing.count += weight;
                    existing.contexts.push(section);
                    
                    // Extract related keywords
                    const keywords = this.extractKeywords(section);
                    keywords.forEach(k => existing.keywords.add(k));
                    
                    topicMentions.set(topic, existing);
                }
            });

            // Look for code examples
            if (section.includes('```') || section.includes('`')) {
                const codeKeywords = this.extractCodeKeywords(section);
                codeKeywords.forEach(keyword => {
                    const existing = topicMentions.get(keyword) || { count: 0, contexts: [], keywords: new Set() };
                    existing.count += 0.5;
                    existing.contexts.push(section);
                    topicMentions.set(keyword, existing);
                });
            }
        });

        // Convert to topics
        const topics: Topic[] = Array.from(topicMentions.entries())
            .map(([name, data]) => ({
                name,
                confidence: Math.min(1, data.count / 3),
                keywords: Array.from(data.keywords)
            }))
            .filter(topic => topic.confidence >= minConfidence)
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, maxTopics);

        return topics;
    }

    private extractKeywords(text: string): string[] {
        const words = text.toLowerCase().split(/\W+/);
        return words.filter(word =>
            word.length > 3 &&
            this.technicalTerms.has(word) &&
            !this.isStopWord(word)
        );
    }

    private extractCodeKeywords(text: string): string[] {
        const codePatterns = [
            /class\s+(\w+)/g,
            /function\s+(\w+)/g,
            /method\s+(\w+)/g,
            /interface\s+(\w+)/g,
            /import\s+(\w+)/g,
            /require\s+['"](.+?)['"]/g
        ];

        const keywords = new Set<string>();
        codePatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                if (match[1]) {
                    keywords.add(match[1].toLowerCase());
                }
            }
        });

        return Array.from(keywords);
    }

    private getImportantTerms(text: string): Array<{term: string; score: number}> {
        const terms: Array<{term: string; score: number}> = [];
        const tokens = this.tokenizeContent(text);

        this.tfidf.listTerms(0).forEach(item => {
            const term = item.term;
            if (term.length > 2 && !this.isStopWord(term)) {
                // Boost score for technical terms
                const score = this.technicalTerms.has(term) ? item.tfidf * 1.5 : item.tfidf;
                terms.push({ term, score });
            }
        });

        return terms.sort((a, b) => b.score - a.score);
    }

    private mergeSimilarTopics(topics: Topic[]): Topic[] {
        const merged: Topic[] = [];
        const processed = new Set<string>();

        for (const topic of topics) {
            if (processed.has(topic.name)) continue;

            // Find similar topics
            const similar = topics.filter(t => 
                !processed.has(t.name) && 
                (this.areTopicsSimilar(topic, t) || this.areTopicsRelated(topic, t))
            );

            if (similar.length > 0) {
                // Merge topics
                const mergedTopic: Topic = {
                    name: this.selectBestTopicName(similar.map(t => t.name)),
                    confidence: Math.max(...similar.map(t => t.confidence)),
                    keywords: Array.from(new Set(similar.flatMap(t => t.keywords)))
                };
                merged.push(mergedTopic);
                similar.forEach(t => processed.add(t.name));
            } else {
                merged.push(topic);
                processed.add(topic.name);
            }
        }

        return merged;
    }

    private areTopicsSimilar(topic1: Topic, topic2: Topic): boolean {
        // Check for stem similarity
        const stem1 = this.stemmer.stem(topic1.name);
        const stem2 = this.stemmer.stem(topic2.name);
        if (stem1 === stem2) return true;

        // Check for keyword overlap
        const keywords1 = new Set(topic1.keywords);
        const keywords2 = new Set(topic2.keywords);
        const overlap = [...keywords1].filter(k => keywords2.has(k)).length;
        const similarity = overlap / Math.min(keywords1.size, keywords2.size);
        return similarity > 0.5;
    }

    private areTopicsRelated(topic1: Topic, topic2: Topic): boolean {
        // Check if topics often appear together in technical contexts
        const technicalPairs = [
            ['api', 'wrapper'],
            ['wrapper', 'implementation'],
            ['pattern', 'practice'],
            ['method', 'interface'],
            ['class', 'object'],
            ['error', 'handling'],
            ['authentication', 'security']
        ];

        return technicalPairs.some(([t1, t2]) => 
            (topic1.name.toLowerCase().includes(t1) && topic2.name.toLowerCase().includes(t2)) ||
            (topic1.name.toLowerCase().includes(t2) && topic2.name.toLowerCase().includes(t1))
        );
    }

    private selectBestTopicName(names: string[]): string {
        // Prefer technical terms
        const technicalNames = names.filter(name => 
            this.technicalTerms.has(name.toLowerCase())
        );
        if (technicalNames.length > 0) {
            return technicalNames[0];
        }

        // Otherwise use the longest name
        return names.sort((a, b) => b.length - a.length)[0];
    }

    private areTermsRelated(term1: string, term2: string): boolean {
        // Use word stems to check relation
        const stem1 = this.stemmer.stem(term1);
        const stem2 = this.stemmer.stem(term2);
        
        if (stem1 === stem2) return true;
        
        // Check technical term relationships
        const technicalPairs = [
            ['api', 'wrapper'],
            ['wrapper', 'implementation'],
            ['pattern', 'practice'],
            ['method', 'interface'],
            ['class', 'object'],
            ['error', 'handling'],
            ['authentication', 'security']
        ];

        return technicalPairs.some(([t1, t2]) => 
            (term1.includes(t1) && term2.includes(t2)) ||
            (term1.includes(t2) && term2.includes(t1))
        );
    }

    private selectTopicName(mainTerm: string, relatedTerms: string[]): string {
        // Prefer technical terms
        const technicalTerms = [mainTerm, ...relatedTerms].filter(term => 
            this.technicalTerms.has(term)
        );
        
        if (technicalTerms.length > 0) {
            return technicalTerms[0].charAt(0).toUpperCase() + technicalTerms[0].slice(1);
        }

        return mainTerm.charAt(0).toUpperCase() + mainTerm.slice(1);
    }

    private extractKeyPoints(content: ExtractedContent, topics: Topic[], options: AnalysisOptions): KeyPoint[] {
        // Split content into paragraphs first
        const paragraphs = content.content.split(/\n\n+/);
        const keyPoints: KeyPoint[] = [];
        const minImportance = options.minImportance || 0.25; // Lowered threshold

        // First pass: identify best practice and implementation sections
        const bestPracticeSections = paragraphs.filter(p => 
            /best\s+practices?|recommended|should|must|guidelines?/i.test(p)
        );
        const implementationSections = paragraphs.filter(p => 
            /implementation|example|usage|how\s+to|approach/i.test(p) ||
            p.includes('```') || 
            /\b(function|class|method|interface)\b/.test(p)
        );

        // Process best practice sections
        bestPracticeSections.forEach(section => {
            const sentences = section.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);
            sentences.forEach(sentence => {
                if (this.isBestPracticeStatement(sentence)) {
                    const importance = this.calculateSentenceImportance(sentence, topics) * 1.3; // Boost best practices
                    if (importance >= minImportance) {
                        keyPoints.push({
                            text: sentence.trim(),
                            importance,
                            topics: this.findRelatedTopics(sentence, topics),
                            supportingEvidence: this.findSupportingEvidence(sentence, content)
                        });
                    }
                }
            });
        });

        // Process implementation sections
        implementationSections.forEach(section => {
            const sentences = section.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);
            sentences.forEach(sentence => {
                if (this.isImplementationGuidance(sentence)) {
                    const importance = this.calculateSentenceImportance(sentence, topics) * 1.2; // Boost implementation guidance
                    if (importance >= minImportance) {
                        const evidence = [
                            ...this.findSupportingEvidence(sentence, content),
                            ...this.extractCodeExamples(section)
                        ];
                        keyPoints.push({
                            text: sentence.trim(),
                            importance,
                            topics: this.findRelatedTopics(sentence, topics),
                            supportingEvidence: evidence
                        });
                    }
                }
            });
        });

        // Process remaining paragraphs for other insights
        paragraphs.forEach(paragraph => {
            if (!bestPracticeSections.includes(paragraph) && !implementationSections.includes(paragraph)) {
                const sentences = paragraph.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);
                sentences.forEach(sentence => {
                    const importance = this.calculateSentenceImportance(sentence, topics);
                    if (importance >= minImportance && this.isInsightful(sentence)) {
                        keyPoints.push({
                            text: sentence.trim(),
                            importance,
                            topics: this.findRelatedTopics(sentence, topics),
                            supportingEvidence: this.findSupportingEvidence(sentence, content)
                        });
                    }
                });
            }
        });

        return this.deduplicateKeyPoints(
            keyPoints.sort((a, b) => b.importance - a.importance)
                .slice(0, options.maxKeyPoints || 15)
        );
    }

    private isBestPracticeStatement(sentence: string): boolean {
        const bestPracticeIndicators = [
            /\b(?:should|must|recommend|best|practice|important|key|essential|avoid|ensure)\b/i,
            /\b(?:pattern|approach|strategy|technique|principle)\b/i,
            /\b(?:better|improve|optimize|enhance)\b/i,
            /\b(?:common|typical|standard|conventional)\b/i
        ];

        const lowerSentence = sentence.toLowerCase();
        return bestPracticeIndicators.some(pattern => pattern.test(lowerSentence)) &&
               !this.isBoilerplate(sentence);
    }

    private isImplementationGuidance(sentence: string): boolean {
        const implementationIndicators = [
            /\b(?:implement|create|build|develop|use|initialize|configure)\b/i,
            /\b(?:method|function|class|interface|object)\b/i,
            /\b(?:parameter|argument|return|value|type)\b/i,
            /\b(?:example|sample|demo|code)\b/i
        ];

        const lowerSentence = sentence.toLowerCase();
        return implementationIndicators.some(pattern => pattern.test(lowerSentence)) &&
               !this.isBoilerplate(sentence);
    }

    private isInsightful(sentence: string): boolean {
        // Check if sentence contains meaningful technical content
        const technicalTermCount = this.tokenizeContent(sentence)
            .filter(token => this.technicalTerms.has(token)).length;
        
        return technicalTermCount >= 2 && // Has multiple technical terms
               sentence.length > 30 &&     // Not too short
               !this.isBoilerplate(sentence) &&
               !/^\s*[^a-zA-Z]*\s*$/.test(sentence); // Contains actual words
    }

    private extractCodeExamples(text: string): string[] {
        const examples: string[] = [];
        
        // Extract code blocks
        const codeBlockRegex = /```[\s\S]*?```/g;
        let match;
        while ((match = codeBlockRegex.exec(text)) !== null) {
            examples.push(match[0]);
        }
        
        // Extract inline code
        const inlineCodeRegex = /`[^`]+`/g;
        while ((match = inlineCodeRegex.exec(text)) !== null) {
            examples.push(match[0]);
        }
        
        return examples;
    }

    private deduplicateKeyPoints(keyPoints: KeyPoint[]): KeyPoint[] {
        const unique: KeyPoint[] = [];
        const seen = new Set<string>();

        for (const point of keyPoints) {
            const normalized = this.normalizeText(point.text);
            if (!seen.has(normalized) && !this.hasVerySimilarPoint(normalized, seen)) {
                unique.push(point);
                seen.add(normalized);
            }
        }

        return unique;
    }

    private normalizeText(text: string): string {
        return text.toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[^\w\s]/g, '')
            .trim();
    }

    private hasVerySimilarPoint(text: string, seen: Set<string>): boolean {
        for (const existing of seen) {
            const similarity = this.calculateTextSimilarity(text, existing);
            if (similarity > 0.8) return true;
        }
        return false;
    }

    private calculateTextSimilarity(text1: string, text2: string): number {
        const words1 = new Set(text1.split(' '));
        const words2 = new Set(text2.split(' '));
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        return intersection.size / union.size;
    }

    private calculateSentenceImportance(sentence: string, topics: Topic[]): number {
        const tokens = this.tokenizeContent(sentence);
        let importance = 0;
        let technicalTermCount = 0;
        let hasCodeExample = false;

        // Check for code-like content
        hasCodeExample = sentence.includes('```') ||
                        sentence.includes('`') ||
                        /\b(function|class|const|let|var|import|export)\b/.test(sentence);

        // Count technical terms with weighted categories
        const termWeights = {
            implementation: 1.2,  // Implementation details
            pattern: 1.2,        // Design patterns
            practice: 1.2,       // Best practices
            test: 1.1,          // Testing related
            error: 1.1,         // Error handling
            api: 1.3,           // API specific
            wrapper: 1.3,       // Wrapper specific
            method: 1.1,        // Method related
            class: 1.1          // Class related
        };

        tokens.forEach(token => {
            if (this.technicalTerms.has(token)) {
                technicalTermCount++;
                // Apply additional weight for key terms
                for (const [term, weight] of Object.entries(termWeights)) {
                    if (token.includes(term)) {
                        importance += weight - 1; // Add the extra weight
                    }
                }
            }
        });

        // Calculate topic relevance with reduced penalty for multiple topics
        topics.forEach(topic => {
            topic.keywords.forEach(keyword => {
                if (tokens.includes(keyword.toLowerCase())) {
                    importance += topic.confidence * 0.8; // Reduced weight per topic
                }
            });
        });

        // Boost importance based on technical term density
        const technicalDensity = technicalTermCount / tokens.length;
        importance += technicalDensity * 0.5; // Reduced multiplier

        // Boost for code examples
        if (hasCodeExample) {
            importance += 0.3;
        }

        // Boost for sentences that look like best practices or implementation guidance
        if (
            sentence.toLowerCase().includes('should') ||
            sentence.toLowerCase().includes('best practice') ||
            sentence.toLowerCase().includes('recommend') ||
            sentence.toLowerCase().includes('pattern') ||
            sentence.toLowerCase().includes('example')
        ) {
            importance += 0.2;
        }

        return Math.min(importance, 1);
    }

    private findRelatedTopics(sentence: string, topics: Topic[]): string[] {
        const tokens = this.tokenizeContent(sentence);
        return topics
            .filter(topic => 
                topic.keywords.some(keyword => 
                    tokens.includes(keyword.toLowerCase())
                )
            )
            .map(topic => topic.name);
    }

    private findSupportingEvidence(sentence: string, content: ExtractedContent): string[] {
        const tokens = this.tokenizeContent(sentence);
        const evidence: string[] = [];
        
        // Split content into sentences
        const sentences = content.content.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
        
        // Find sentences that share significant terms with the input sentence
        sentences.forEach(s => {
            if (s === sentence) return;
            
            const sTokens = this.tokenizeContent(s);
            const sharedTerms = tokens.filter(t => sTokens.includes(t));
            
            // Check if the sentence contains technical terms
            const hasTechnicalTerms = sTokens.some(t => this.technicalTerms.has(t));
            
            if (sharedTerms.length >= 2 && hasTechnicalTerms) {
                evidence.push(s);
            }
        });

        return evidence;
    }

    private extractEntities(content: ExtractedContent): Entity[] {
        // Extract technical entities like algorithm names, standards, etc.
        const entities: Entity[] = [];
        const text = content.content;

        // Look for standard numbers (e.g., FIPS 203)
        const standardRegex = /(?:FIPS|SP|RFC)\s+\d+(?:-\d+)?/g;
        const standards = text.match(standardRegex) || [];
        standards.forEach(standard => {
            const mentions = this.findMentions(text, standard);
            entities.push({
                name: standard,
                type: 'standard' as EntityType,
                mentions
            });
        });

        // Look for algorithm names
        const algorithmRegex = /(?:ML-KEM|ML-DSA|SLH-DSA|CRYSTALS-Kyber|CRYSTALS-Dilithium|SPHINCS\+|FALCON)(?:-\d+)?/g;
        const algorithms = text.match(algorithmRegex) || [];
        algorithms.forEach(algorithm => {
            const mentions = this.findMentions(text, algorithm);
            entities.push({
                name: algorithm,
                type: 'algorithm' as EntityType,
                mentions
            });
        });

        return entities;
    }

    private findMentions(text: string, term: string): EntityMention[] {
        const mentions: EntityMention[] = [];
        let pos = text.indexOf(term);
        while (pos !== -1) {
            const start = Math.max(0, pos - 50);
            const end = Math.min(text.length, pos + term.length + 50);
            mentions.push({
                text: term,
                position: {
                    start: pos,
                    end: pos + term.length
                },
                context: text.substring(start, end)
            });
            pos = text.indexOf(term, pos + 1);
        }
        return mentions;
    }

    private findRelationships(entities: Entity[], content: ExtractedContent): Relationship[] {
        const relationships: Relationship[] = [];
        const text = content.content;

        // Look for relationships between standards and algorithms
        entities.forEach(e1 => {
            if (e1.type === 'standard') {
                entities.forEach(e2 => {
                    if (e2.type === 'algorithm') {
                        // Check if entities appear close to each other
                        const distance = this.findMinDistance(text, e1.name, e2.name);
                        if (distance < 100) { // within 100 characters
                            relationships.push({
                                source: e1.name,
                                target: e2.name,
                                type: 'specifies',
                                confidence: 1 - (distance / 100)
                            });
                        }
                    }
                });
            }
        });

        return relationships;
    }

    private findMinDistance(text: string, term1: string, term2: string): number {
        let minDistance = Infinity;
        let pos1 = text.indexOf(term1);
        
        while (pos1 !== -1) {
            let pos2 = text.indexOf(term2);
            while (pos2 !== -1) {
                const distance = Math.abs(pos2 - pos1);
                minDistance = Math.min(minDistance, distance);
                pos2 = text.indexOf(term2, pos2 + 1);
            }
            pos1 = text.indexOf(term1, pos1 + 1);
        }
        
        return minDistance;
    }

    private analyzeSentiment(text: string) {
        const analyzer = new natural.SentimentAnalyzer(
            'English',
            natural.PorterStemmerFr,
            'afinn'
        );
        
        const tokens = this.tokenizeContent(text);
        const score = analyzer.getSentiment(tokens);

        return {
            score: Math.max(-1, Math.min(1, score)), // Normalize to [-1, 1]
            confidence: Math.abs(score) / 5, // Simple confidence calculation
            aspects: [] // Could be enhanced with aspect-based sentiment analysis
        };
    }

    private assessQuality(content: ExtractedContent): ContentQuality {
        return {
            readability: this.calculateReadabilityScore(content.content),
            informationDensity: this.calculateInformationDensity(content),
            technicalDepth: this.calculateTechnicalDepth(content),
            credibilityScore: this.calculateCredibilityScore(content),
            freshness: this.calculateFreshnessScore(content)
        };
    }

    private calculateReadabilityScore(text: string): number {
        const sentences = text.split(/[.!?]+/).length;
        const words = text.split(/\s+/).length;
        const syllables = this.countSyllables(text);
        
        // Flesch-Kincaid Grade Level
        const grade = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
        
        // Convert to a 0-1 score, where 0.5 represents college level
        return Math.max(0, Math.min(1, 1 - (grade / 20)));
    }

    private countSyllables(text: string): number {
        const words = text.split(/\s+/);
        return words.reduce((count, word) => {
            return count + this.countWordSyllables(word);
        }, 0);
    }

    private countWordSyllables(word: string): number {
        word = word.toLowerCase();
        if (word.length <= 3) return 1;
        
        word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
        word = word.replace(/^y/, '');
        
        const syllables = word.match(/[aeiouy]{1,2}/g);
        return syllables ? syllables.length : 1;
    }

    private calculateInformationDensity(content: ExtractedContent): number {
        const tokens = this.tokenizeContent(content.content);
        const technicalTerms = tokens.filter(t => this.technicalTerms.has(t));
        return Math.min(1, technicalTerms.length / (tokens.length * 0.2));
    }

    private calculateTechnicalDepth(content: ExtractedContent): number {
        const tokens = this.tokenizeContent(content.content);
        const uniqueTechnicalTerms = new Set(
            tokens.filter(t => this.technicalTerms.has(t))
        );
        return Math.min(1, uniqueTechnicalTerms.size / 20);
    }

    private calculateCredibilityScore(content: ExtractedContent): number {
        let score = 0.5; // Base score

        // Check for technical domain
        if (content.url.includes('.gov') || 
            content.url.includes('.edu') ||
            content.url.includes('csrc.') ||
            content.url.includes('nist.')) {
            score += 0.2;
        }

        // Check for citations
        const citations = this.extractCitations(content);
        if (citations.length > 0) {
            score += 0.1;
        }

        // Check for technical content
        const tokens = this.tokenizeContent(content.content);
        const technicalTermRatio = tokens.filter(t => this.technicalTerms.has(t)).length / tokens.length;
        score += technicalTermRatio * 0.2;

        return Math.min(1, score);
    }

    private calculateFreshnessScore(content: ExtractedContent): number {
        if (!content.metadata?.datePublished) return 0.5;

        const published = new Date(content.metadata.datePublished);
        const now = new Date();
        const ageInDays = (now.getTime() - published.getTime()) / (1000 * 60 * 60 * 24);

        // Score decreases with age, but technical content stays relevant longer
        return Math.max(0, Math.min(1, 1 - (ageInDays / 365)));
    }

    private extractCitations(content: ExtractedContent): Citation[] {
        const citations: Citation[] = [];
        const text = content.content;

        // Look for standard references
        const standardRefs = text.match(/(?:FIPS|SP|RFC)\s+\d+(?:-\d+)?/g) || [];
        standardRefs.forEach(ref => {
            citations.push({
                text: ref,
                type: 'standard'
            });
        });

        // Look for URL citations
        const urls = text.match(/https?:\/\/[^\s)]+/g) || [];
        urls.forEach(url => {
            citations.push({
                text: url,
                type: 'url',
                source: url
            });
        });

        return citations;
    }

    private isStopWord(word: string): boolean {
        return natural.stopwords.includes(word.toLowerCase());
    }

    private calculateRelevanceScore(content: ExtractedContent, topics: Topic[]): number {
        // Calculate overall relevance based on topics and content quality
        const topicScore = topics.reduce((sum, topic) => sum + topic.confidence, 0) / (topics.length || 1);
        const quality = this.assessQuality(content);
        
        return Math.min(
            1,
            (topicScore * 0.6) + 
            (quality.technicalDepth * 0.2) + 
            (quality.informationDensity * 0.2)
        );
    }

    private isBoilerplate(text: string): boolean {
        return this.boilerplatePatterns.some(pattern => pattern.test(text));
    }
}