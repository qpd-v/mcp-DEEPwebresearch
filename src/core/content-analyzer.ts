import natural from 'natural';
import { ContentAnalysis, Topic, KeyPoint, Entity, EntityType, EntityMention, Relationship, Citation, ContentQuality, AnalysisOptions } from '../types/analysis.js';
import { ExtractedContent } from '../types/content.js';

export class ContentAnalyzer {
    private tokenizer: natural.WordTokenizer;
    private tfidf: natural.TfIdf;
    private stemmer: typeof natural.PorterStemmerFr;
    private technicalTerms: Set<string>;
    
    constructor() {
        this.tokenizer = new natural.WordTokenizer();
        this.tfidf = new natural.TfIdf();
        this.stemmer = natural.PorterStemmerFr;
        
        // Initialize common technical terms
        this.technicalTerms = new Set([
            'algorithm', 'encryption', 'cryptography', 'quantum', 'standard',
            'protocol', 'security', 'implementation', 'parameter', 'mechanism',
            'authentication', 'signature', 'verification', 'validation', 'key',
            'public', 'private', 'symmetric', 'asymmetric', 'cipher',
            'hash', 'digital', 'certificate', 'computation', 'lattice'
        ]);
    }

    public async analyze(content: ExtractedContent, options: AnalysisOptions = {}): Promise<ContentAnalysis> {
        // Prepare content for analysis
        const tokens = this.tokenizeContent(content.content);
        this.tfidf.addDocument(tokens);

        // Extract topics and calculate relevance
        const topics = await this.extractTopics(content, options);
        const keyPoints = this.extractKeyPoints(content, topics, options);
        const entities = this.extractEntities(content);
        const relationships = this.findRelationships(entities, content);
        const sentiment = this.analyzeSentiment(content.content);
        const quality = this.assessQuality(content);

        // Merge similar topics
        const mergedTopics = this.mergeSimilarTopics(topics);

        return {
            relevanceScore: this.calculateRelevanceScore(content, mergedTopics),
            topics: mergedTopics,
            keyPoints: this.deduplicateKeyPoints(keyPoints),
            entities,
            sentiment,
            relationships,
            citations: this.extractCitations(content),
            quality
        };
    }

    private tokenizeContent(text: string): string[] {
        return this.tokenizer.tokenize(text.toLowerCase()) || [];
    }

    private async extractTopics(content: ExtractedContent, options: AnalysisOptions): Promise<Topic[]> {
        const maxTopics = options.maxTopics || 5;
        const minConfidence = options.minConfidence || 0.3;

        // Get important terms using TF-IDF
        const terms = this.getImportantTerms(content.content);
        
        // Group related terms into topics
        const topics: Topic[] = [];
        const processedTerms = new Set<string>();

        for (const term of terms) {
            if (processedTerms.has(term.term)) continue;
            
            const relatedTerms = terms.filter(t => 
                this.areTermsRelated(term.term, t.term) && 
                !processedTerms.has(t.term)
            );

            if (relatedTerms.length > 0) {
                const topic: Topic = {
                    name: this.selectTopicName(term.term, relatedTerms.map(t => t.term)),
                    confidence: term.score,
                    keywords: [term.term, ...relatedTerms.map(t => t.term)]
                };

                topics.push(topic);
                processedTerms.add(term.term);
                relatedTerms.forEach(t => processedTerms.add(t.term));
            }

            if (topics.length >= maxTopics) break;
        }

        return topics.filter(topic => topic.confidence >= minConfidence);
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
            ['key', 'encryption'],
            ['key', 'cryptography'],
            ['quantum', 'cryptography'],
            ['quantum', 'security'],
            ['encryption', 'security'],
            ['standard', 'implementation'],
            ['algorithm', 'implementation']
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
            ['key', 'encryption'],
            ['key', 'cryptography'],
            ['quantum', 'cryptography'],
            ['quantum', 'security'],
            ['encryption', 'security'],
            ['standard', 'implementation'],
            ['algorithm', 'implementation']
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
        // Split content into sentences
        const sentences = content.content.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
        const keyPoints: KeyPoint[] = [];
        const minImportance = options.minImportance || 0.5;

        for (const sentence of sentences) {
            const importance = this.calculateSentenceImportance(sentence, topics);
            if (importance >= minImportance) {
                const relatedTopics = this.findRelatedTopics(sentence, topics);
                keyPoints.push({
                    text: sentence.trim(),
                    importance,
                    topics: relatedTopics,
                    supportingEvidence: this.findSupportingEvidence(sentence, content)
                });
            }
        }

        return this.deduplicateKeyPoints(
            keyPoints.sort((a, b) => b.importance - a.importance)
                .slice(0, options.maxKeyPoints || 10)
        );
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

        // Count technical terms
        tokens.forEach(token => {
            if (this.technicalTerms.has(token)) {
                technicalTermCount++;
            }
        });

        // Calculate topic relevance
        topics.forEach(topic => {
            topic.keywords.forEach(keyword => {
                if (tokens.includes(keyword.toLowerCase())) {
                    importance += topic.confidence;
                }
            });
        });

        // Boost importance based on technical term density
        const technicalDensity = technicalTermCount / tokens.length;
        importance *= (1 + technicalDensity);

        return Math.min(importance / (topics.length || 1), 1);
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
}