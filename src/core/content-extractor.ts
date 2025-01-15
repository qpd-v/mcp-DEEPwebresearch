import * as cheerio from 'cheerio';
import htmlToMd from 'html-to-md';
import { ExtractedContent, ContentMetadata, ContentSection, ContentExtractionOptions } from '../types/content.js';

type CheerioRoot = ReturnType<typeof cheerio.load>;

export class ContentExtractor {
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
            .filter(section => section.type === 'main')
            .map(section => section.content)
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
        // Remove script and style elements
        $('script, style, noscript, iframe, form').remove();

        // Remove hidden elements
        $('[style*="display: none"], [style*="display:none"], [hidden]').remove();

        // Remove boilerplate elements
        this.boilerplateSelectors.forEach(selector => {
            $(selector).remove();
        });

        // Remove empty elements
        $('*').each((_, elem) => {
            const $elem = $(elem);
            if ($elem.text().trim() === '' && !$elem.find('img').length) {
                $elem.remove();
            }
        });
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
            '.content'
        ];

        let mainContent: cheerio.Cheerio = $('body');  // Default to body
        for (const selector of mainSelectors) {
            const element = $(selector);
            if (element.length > 0) {
                mainContent = element;
                break;
            }
        }

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
            
            // Start new section on headings
            if ($element.is('h1, h2, h3')) {
                if (currentSection.content.trim()) {
                    sections.push(currentSection);
                }
                currentSection = {
                    id: `section-${sections.length + 1}`,
                    title: $element.text().trim(),
                    content: $element.html() || '',
                    importance: this.calculateImportance($element),
                    type: 'main'
                };
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

    private calculateImportance($element: cheerio.Cheerio): number {
        // Base importance on heading level
        if ($element.is('h1')) return 1;
        if ($element.is('h2')) return 0.8;
        if ($element.is('h3')) return 0.6;

        // Default importance
        return 0.5;
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