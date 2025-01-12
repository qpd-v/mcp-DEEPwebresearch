import { Browser, BrowserContext, chromium } from 'playwright';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import os from 'os';
import { ParallelSearchResult, SearchResult, SearchOptions } from './types.js';

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
];

const VIEWPORT_SIZES = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 }
];

export class ParallelSearch {
    private browser: Browser | null = null;
    private contexts: BrowserContext[] = [];
    private options: Required<SearchOptions>;

    constructor(options: SearchOptions = {}) {
        this.options = {
            maxParallel: options.maxParallel || 10,
            delayBetweenSearches: options.delayBetweenSearches || 200,
            outputDir: path.isAbsolute(options.outputDir || '')
                ? (options.outputDir || path.join(os.tmpdir(), 'search-results'))
                : path.join(os.tmpdir(), options.outputDir || 'search-results'),
            retryAttempts: options.retryAttempts || 3
        };
    }

    private async initialize(): Promise<void> {
        if (!this.browser) {
            this.browser = await chromium.launch({ headless: true });
            // Create browser contexts
            for (let i = 0; i < this.options.maxParallel; i++) {
                const context = await this.browser.newContext({
                    userAgent: USER_AGENTS[i % USER_AGENTS.length],
                    viewport: VIEWPORT_SIZES[i % VIEWPORT_SIZES.length],
                    deviceScaleFactor: 1 + (Math.random() * 0.5),
                    hasTouch: Math.random() > 0.5
                });
                this.contexts.push(context);
            }
        }
    }

    private async saveResults(searchId: string, query: string, results: SearchResult[]): Promise<string> {
        const filename = `${searchId}-${query.replace(/[^a-z0-9]/gi, '_')}.json`;
        const outputDir = this.options.outputDir;
        
        // Create output directory if it doesn't exist
        await mkdir(outputDir, { recursive: true });
        
        const filepath = path.join(outputDir, filename);
        await writeFile(filepath, JSON.stringify({
            searchId,
            query,
            timestamp: new Date().toISOString(),
            results
        }, null, 2));
        return filepath;
    }

    private async singleSearch(
        context: BrowserContext,
        query: string,
        searchId: string
    ): Promise<ParallelSearchResult> {
        const page = await context.newPage();
        try {
            await page.goto('https://www.google.com', { waitUntil: 'networkidle' });
            
            // Wait for and handle any consent dialog
            try {
                const consentButton = await page.$('button:has-text("Accept all")');
                if (consentButton) {
                    await consentButton.click();
                    await page.waitForLoadState('networkidle');
                }
            } catch (error) {
                // Ignore consent handling errors
            }

            // Try different selectors for search input
            const searchInput = await page.$(
                'textarea[name="q"], input[name="q"], input[type="text"]'
            );
            
            if (!searchInput) {
                throw new Error('Search input not found');
            }

            await searchInput.click();
            await searchInput.fill(query);
            await Promise.all([
                page.keyboard.press('Enter'),
                page.waitForNavigation({ waitUntil: 'networkidle' })
            ]);

            // Wait for search results to appear
            await page.waitForSelector('div.g', { timeout: 10000 });

            // Extract results after ensuring they're loaded
            const results = await page.$$eval('div.g', (elements) => {
                return elements.map(el => {
                    const titleEl = el.querySelector('h3');
                    const linkEl = el.querySelector('a');
                    const snippetEl = el.querySelector('div.VwiC3b');

                    if (!titleEl || !linkEl || !snippetEl) return null;

                    return {
                        title: titleEl.textContent || '',
                        url: linkEl.href || '',
                        snippet: snippetEl.textContent || ''
                    };
                }).filter(result => result !== null);
            });

            if (!results || results.length === 0) {
                throw new Error('No search results found');
            }

            await this.saveResults(searchId, query, results);
            
            return {
                searchId,
                query,
                results
            };
        } catch (error) {
            return {
                searchId,
                query,
                results: [],
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        } finally {
            await page.close();
        }
    }

    public async parallelSearch(queries: string[]): Promise<ParallelSearchResult[]> {
        await this.initialize();

        const results: ParallelSearchResult[] = [];
        const chunks: string[][] = [];

        // Split queries into chunks of maxParallel size
        for (let i = 0; i < queries.length; i += this.options.maxParallel) {
            chunks.push(queries.slice(i, i + this.options.maxParallel));
        }

        // Process each chunk
        for (const chunk of chunks) {
            const chunkPromises = chunk.map((query, index) => {
                const searchId = `search_${Date.now()}_${index + 1}_of_${chunk.length}`;
                // Stagger the searches
                return new Promise<ParallelSearchResult>(async (resolve) => {
                    await new Promise(r => setTimeout(r, index * this.options.delayBetweenSearches));
                    const result = await this.singleSearch(
                        this.contexts[index % this.contexts.length],
                        query,
                        searchId
                    );
                    resolve(result);
                });
            });

            const chunkResults = await Promise.all(chunkPromises);
            results.push(...chunkResults);

            // Add a small delay between chunks
            if (chunks.indexOf(chunk) < chunks.length - 1) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        return results;
    }

    public async cleanup(): Promise<void> {
        for (const context of this.contexts) {
            await context.close();
        }
        this.contexts = [];
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}