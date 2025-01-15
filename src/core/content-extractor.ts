import * as cheerio from 'cheerio';
import htmlToMd from 'html-to-md';
import { ExtractedContent, ContentMetadata, ContentSection, ContentExtractionOptions } from '../types/content.js';

type CheerioRoot = ReturnType<typeof cheerio.load>;

export class ContentExtractor {
    private technicalSelectors = [
        // Code blocks and examples
        'pre', 'code', '.example', '.code-example',
        // API and implementation details
        '.api-details', '.implementation-details',
        '.method-signature', '.function-signature',
        // Parameters and documentation
        '.parameters', '.returns', '.arguments',
        '.technical-docs', '.api-docs'
    ];

    private boilerplateSelectors = [
        // Navigation elements
        'nav', 'header', 'footer', 
        // Social sharing
        '.social-share', '.share-buttons', '[id*="share"]', '[class*="share"]',
        // Navigation menus
        '.menu', '.navigation', '#menu', '#nav',
        // Sidebars
        '.sidebar', '#sidebar', '[class*="sidebar"]',
        // Comments
        '#comments', '.comments', '.comment-section',
        // Advertisements
        '.ad', '.ads', '.advertisement', '[id*="ad-"]', '[class*="ad-"]',
        // Popups and overlays
        '.popup', '.modal', '.overlay',
        // Common UI elements
        '.header-content', '.footer-content', '.site-header', '.site-footer',
        // Cookie notices and banners
        '.cookie-notice', '.cookie-banner', '.gdpr',
        // Search and related content
        '.search', '.search-form', '.related-posts', '.related-articles',
        // Common widget areas
        '.widget', '.widgets', '[class*="widget"]',
        // Newsletter and subscription forms
        '.newsletter', '.subscribe', '[class*="newsletter"]', '[class*="subscribe"]',
        // Social media elements
        '.social', '.social-media', '[class*="social"]',
        // Print and utility links
        '.print', '.utility-nav', '[class*="print"]',
        // Common dynamic elements
        '[data-widget]', '[data-module]',
        // Common tracking and analytics
        '[data-analytics]', '[data-tracking]'
    ];

    private htmlToMarkdownOptions = {
        skipTags: [], // Don't skip any tags by default
        emDelimiter: '_',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
        headingStyle: 'atx',
        keepReplacement: true,
        keepHtml: false,
        listStyle: 'dash',
        codeStyle: 'fenced',
        customRules: [
            // Custom rule for links
            {
                selector: 'a',
                replacement: (content: string, node: any) => {
                    const href = node.getAttribute('href');
                    // Only preserve external links
                    if (href && href.startsWith('http')) {
                        return `[${content}](${href})`;
                    }
                    return content;
                }
            },
            // Custom rule for images
            {
                selector: 'img',
                replacement: (content: string, node: any) => {
                    const alt = node.getAttribute('alt');
                    return alt ? `[Image: ${alt}]` : '';
                }
            },
            // Custom rule for tables
            {
                selector: 'table',
                replacement: (content: string, node: any) => {
                    return this.convertTableToMarkdown(node);
                }
            }
        ]
    };

    private convertTableToMarkdown(tableNode: any): string {
        const $ = cheerio.load(tableNode);
        let markdown = '\n';

        // Get all rows including header row
        const rows = $('tr').toArray();
        if (rows.length === 0) return '';

        // Get maximum number of columns
        const maxColumns = Math.max(...rows.map(row => $(row).find('th, td').length));
        if (maxColumns === 0) return '';

        // Process headers
        const headerRow = $(rows[0]);
        const headers: string[] = [];
        headerRow.find('th, td').each((_, cell) => {
            headers.push($(cell).text().trim() || ' ');
        });
        // Pad headers if needed
        while (headers.length < maxColumns) {
            headers.push(' ');
        }

        // Create header row
        markdown += '| ' + headers.join(' | ') + ' |\n';
        // Create separator row with proper alignment
        markdown += '|' + Array(maxColumns).fill(' --- ').join('|') + '|\n';

        // Process data rows (skip first row if it was header)
        for (let i = headerRow.find('th').length > 0 ? 1 : 0; i < rows.length; i++) {
            const cells: string[] = [];
            $(rows[i]).find('td').each((_, cell) => {
                cells.push($(cell).text().trim() || ' ');
            });
            // Pad cells if needed
            while (cells.length < maxColumns) {
                cells.push(' ');
            }
            markdown += '| ' + cells.join(' | ') + ' |\n';
        }

        return markdown + '\n';
    }

    public async extract(html: string, url: string, options: ContentExtractionOptions = {}): Promise<ExtractedContent> {
        const $ = cheerio.load(html);
        
        // Remove unwanted elements
        this.cleanupDOM($);

        // Extract metadata
        const metadata = this.extractMetadata($);

        // Extract main content sections
        const sections = this.extractContentSections($);

        // Extract structured data
        const structuredData = options.extractStructuredData ? 
            this.extractStructuredData($) : undefined;

        // Convert content to markdown
        const mainContent = sections
            .map(section => section.content) // Include all sections
            .join('\n\n');

        const content = htmlToMd(mainContent, this.htmlToMarkdownOptions);

        // Clean up and format the content
        const cleanedContent = this.cleanContent(this.formatMarkdown(content));

        return {
            url,
            title: this.extractTitle($),
            content: this.truncateContent(cleanedContent, options.maxContentLength),
            html: options.includeHtml ? html : undefined,
            timestamp: new Date().toISOString(),
            metadata,
            structuredData
        };
    }

    private cleanupDOM($: CheerioRoot): void {
        // First pass: Remove obvious non-content elements
        $('script, style, noscript, iframe, form, link, meta').remove();
        $('[style*="display: none"], [style*="display:none"], [hidden]').remove();
        
        // Second pass: Remove navigation and UI elements but preserve technical content
        this.boilerplateSelectors.forEach(selector => {
            // Don't remove elements that contain code or technical content
            $(selector).each((_, elem) => {
                const $elem = $(elem);
                if (!this.containsTechnicalContent($elem)) {
                    $elem.remove();
                }
            });
        });

        // Third pass: Clean up common UI patterns
        $('*').each((_, elem) => {
            const $elem = $(elem);
            const text = $elem.text().trim();
            
            // Skip if element contains technical content
            if (this.containsTechnicalContent($elem)) {
                return;
            }

            // Remove elements that are clearly UI components
            if (
                text.match(/^(close|dismiss|accept|cancel|loading|\d+ min read|share|menu|search)$/i) ||
                text.match(/^(follow us|subscribe|sign up|log in|register)$/i)
            ) {
                $elem.remove();
                return;
            }

            // Remove empty elements except code blocks
            if (!$elem.is('pre, code') && text === '' && !$elem.find('img').length) {
                $elem.remove();
            }
        });

        // Fourth pass: Remove duplicate content but preserve code blocks
        const seen = new Set<string>();
        $('p, li, td, div').each((_, elem) => {
            const $elem = $(elem);
            if (this.containsTechnicalContent($elem)) {
                return; // Don't deduplicate technical content
            }
            const text = $elem.text().trim();
            if (text && seen.has(text)) {
                $elem.remove();
            } else {
                seen.add(text);
            }
        });
    }

    private containsTechnicalContent($elem: cheerio.Cheerio): boolean {
        // Check if element matches technical selectors
        if (this.technicalSelectors.some(selector => $elem.is(selector))) {
            return true;
        }

        // Check if element contains code blocks
        if ($elem.find('pre, code').length > 0) {
            return true;
        }

        // Check for technical keywords in text
        const text = $elem.text().toLowerCase();
        return (
            text.includes('example') ||
            text.includes('implementation') ||
            text.includes('usage') ||
            text.includes('api') ||
            text.includes('method') ||
            text.includes('function') ||
            text.includes('parameter') ||
            text.includes('return') ||
            text.includes('class') ||
            text.includes('interface') ||
            text.includes('object') ||
            text.includes('pattern')
        );
    }

    private cleanContent(content: string): string {
        return content
            // Remove duplicate newlines
            .replace(/\n{3,}/g, '\n\n')
            // Remove lines that are just special characters or very short
            .split('\n')
            .filter(line => {
                const trimmed = line.trim();
                if (trimmed.length < 3) return false;
                if (/^[-_=*#]+$/.test(trimmed)) return false;
                return true;
            })
            // Remove duplicate paragraphs
            .filter((line, index, arr) => {
                return arr.indexOf(line) === index;
            })
            .join('\n');
    }

    private extractTitle($: CheerioRoot): string {
        // Try OpenGraph title first
        const ogTitle = $('meta[property="og:title"]').attr('content');
        if (ogTitle) return ogTitle;

        // Try article title
        const articleTitle = $('article h1').first().text();
        if (articleTitle) return articleTitle;

        // Try main title
        const mainTitle = $('h1').first().text() || $('title').text();
        if (mainTitle) return mainTitle;

        return 'Untitled';
    }

    private extractMetadata($: CheerioRoot): ContentMetadata {
        const metadata: ContentMetadata = {};

        // Extract author
        metadata.author = 
            $('meta[name="author"]').attr('content') ||
            $('meta[property="article:author"]').attr('content') ||
            $('.author').first().text() ||
            $('[itemprop="author"]').first().text();

        // Extract dates
        metadata.datePublished = 
            $('meta[property="article:published_time"]').attr('content') ||
            $('meta[name="publication-date"]').attr('content') ||
            $('[itemprop="datePublished"]').attr('content');

        metadata.lastModified = 
            $('meta[property="article:modified_time"]').attr('content') ||
            $('[itemprop="dateModified"]').attr('content');

        // Extract language
        metadata.language = $('html').attr('lang') || undefined;

        // Calculate reading time and word count
        const text = $('body').text();
        const words = text.trim().split(/\s+/).length;
        metadata.wordCount = words;
        metadata.readingTime = Math.ceil(words / 200); // Assuming 200 words per minute

        return metadata;
    }

    private extractContentSections($: CheerioRoot): ContentSection[] {
        const sections: ContentSection[] = [];

        // Try to find main content container
        const mainSelectors = [
            'article',
            '[role="main"]',
            'main',
            '.main-content',
            '#main-content',
            '.post-content',
            '.article-content',
            '.entry-content',
            '.content',
            '.documentation',
            '.markdown-body'
        ];

        let mainContent: cheerio.Cheerio = $('body');  // Default to body
        for (const selector of mainSelectors) {
            const element = $(selector);
            if (element.length > 0) {
                mainContent = element;
                break;
            }
        }

        // First pass: identify technical sections
        const technicalBlocks: { element: cheerio.Element; importance: number }[] = [];
        mainContent.find('pre, code, .example, .implementation, .method, .function').each((_, element) => {
            const $element = $(element);
            // Get the parent container that includes context
            const container = this.findContextContainer($, $element);
            if (container.length) {
                technicalBlocks.push({
                    element: container[0],
                    importance: this.calculateImportance(container)
                });
            }
        });

        // Extract sections from main content
        let currentSection: ContentSection = {
            id: 'main',
            content: '',
            importance: 1,
            type: 'main'
        };

        mainContent.children().each((_, element) => {
            const $element = $(element);
            
            // Skip if element is empty or contains only whitespace
            if (!$element.text().trim()) return;
            
            // Check if this element is part of a technical block
            const isTechnicalBlock = technicalBlocks.some(block =>
                $.contains(block.element, element) || element === block.element
            );

            // Start new section on headings or technical blocks
            if ($element.is('h1, h2, h3') || isTechnicalBlock) {
                if (currentSection.content.trim()) {
                    sections.push(currentSection);
                }

                const importance = isTechnicalBlock ?
                    Math.max(0.8, this.calculateImportance($element)) :
                    this.calculateImportance($element);

                currentSection = {
                    id: `section-${sections.length + 1}`,
                    title: $element.is('h1, h2, h3') ? $element.text().trim() : 'Technical Section',
                    content: $element.html() || '',
                    importance,
                    type: isTechnicalBlock ? 'technical' : 'main'
                };

                // For technical blocks, include surrounding context
                if (isTechnicalBlock) {
                    const context = this.getContextualContent($, $element);
                    if (context) {
                        currentSection.content = context;
                    }
                }
            } else {
                currentSection.content += '\n' + ($element.html() || '');
            }
        });

        // Add the last section if it has content
        if (currentSection.content.trim()) {
            sections.push(currentSection);
        }

        return sections;
    }

    private findContextContainer($: CheerioRoot, $element: cheerio.Cheerio): cheerio.Cheerio {
        // Look for the nearest container that provides context
        let $container = $element;
        let depth = 0;
        const maxDepth = 3; // Prevent going too far up the DOM

        while (depth < maxDepth) {
            const $parent = $container.parent();
            if (!$parent.length) break;

            // Check if parent provides good context
            const parentText = $parent.text().trim();
            const hasContext = parentText.length > $container.text().length * 1.5 &&
                             this.containsTechnicalContent($parent);

            if (hasContext) {
                $container = $parent;
            }

            depth++;
        }

        return $container;
    }

    private getContextualContent($: CheerioRoot, $element: cheerio.Cheerio): string | null {
        const container = this.findContextContainer($, $element);
        if (!container.length) return null;

        // Get previous sibling if it's a heading or description
        let content = '';
        const $prevSibling = container.prev();
        if ($prevSibling.is('h1, h2, h3, h4, p') &&
            this.containsTechnicalContent($prevSibling)) {
            content += $prevSibling.html() + '\n';
        }

        content += container.html() || '';

        // Get next sibling if it provides additional context
        const $nextSibling = container.next();
        if ($nextSibling.is('p') &&
            this.containsTechnicalContent($nextSibling)) {
            content += '\n' + $nextSibling.html();
        }

        return content;
    }

    private calculateImportance($element: cheerio.Cheerio): number {
        let importance = 0.5;

        // Base importance on heading level
        if ($element.is('h1')) importance = 1;
        else if ($element.is('h2')) importance = 0.8;
        else if ($element.is('h3')) importance = 0.6;

        // Increase importance based on content indicators
        const text = $element.text().toLowerCase();
        if (
            text.includes('example') ||
            text.includes('implementation') ||
            text.includes('usage') ||
            text.includes('api') ||
            text.includes('method') ||
            text.includes('function') ||
            text.includes('parameter') ||
            text.includes('return')
        ) {
            importance += 0.2;
        }

        // Increase importance if contains code
        if ($element.find('code').length > 0 || $element.is('pre')) {
            importance += 0.2;
        }

        // Increase importance for technical elements
        if ($element.is(this.technicalSelectors.join(','))) {
            importance += 0.1;
        }

        return Math.min(importance, 1);
    }

    private extractStructuredData($: CheerioRoot): any[] {
        const structuredData: any[] = [];

        // Extract JSON-LD
        $('script[type="application/ld+json"]').each((_, element) => {
            try {
                const data = JSON.parse($(element).html() || '{}');
                structuredData.push(data);
            } catch (error) {
                // Ignore invalid JSON
            }
        });

        return structuredData;
    }

    private formatMarkdown(content: string): string {
        // First pass: Basic cleanup
        let formatted = content
            // Fix list markers
            .replace(/^\* /gm, '- ')
            // Add spacing around headers
            .replace(/^(#{1,6} .+)$/gm, '\n$1\n')
            // Add spacing around lists
            .replace(/^(- .+)$/gm, '$1\n');

        // Handle code blocks
        formatted = formatted.replace(/`([^`]+)`/g, (match, code) => {
            if (code.includes('\n') || code.includes('function')) {
                return '\n\n```\n' + code.trim() + '\n```\n\n';
            }
            return '`' + code.trim() + '`';
        });

        // Add spacing between sections
        formatted = formatted.replace(/^(#{1,6} .*)/gm, '\n\n$1\n');

        // Handle tables - complete rewrite of table structure
        formatted = formatted.replace(/\|(.*)\|\n/g, (match: string, row: string) => {
            const cells = row.split('|').map((cell: string) => cell.trim()).filter((cell: string) => cell);
            if (cells.length === 0) return '';

            // Detect if this is a separator row
            if (cells.every(cell => /^[-\s]+$/.test(cell))) {
                return '';  // Skip separator rows, we'll add our own
            }

            // Check if this is a header row (no separator row seen yet)
            if (!formatted.includes('| ---')) {
                const separator = cells.map(() => '---').join(' | ');
                return '| ' + cells.join(' | ') + ' |\n| ' + separator + ' |\n';
            }

            return '| ' + cells.join(' | ') + ' |\n';
        });

        // Final cleanup
        return formatted
            // Fix paragraph spacing
            .replace(/\n{3,}/g, '\n\n')
            // Ensure sections are properly separated
            .replace(/(\w)\n(#{1,6} )/g, '$1\n\n$2')
            // Add proper spacing around code blocks
            .replace(/```/g, '\n```\n')
            .replace(/\n{4,}/g, '\n\n\n')
            .trim();
    }

    private truncateContent(content: string, maxLength?: number): string {
        if (!maxLength || content.length <= maxLength) {
            return content;
        }

        // Truncate at word boundary
        const truncated = content.slice(0, maxLength);
        const lastSpace = truncated.lastIndexOf(' ');
        return truncated.slice(0, lastSpace) + '...';
    }
}