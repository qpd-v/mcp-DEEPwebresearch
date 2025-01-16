#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError
} from '@modelcontextprotocol/sdk/types.js';
import { chromium, Browser, Page } from 'playwright';
import TurndownService from 'turndown';

import DeepResearch from './deep-research.js';

interface DeepResearchArgs {
    topic: string;
    maxDepth?: number;
    maxBranching?: number;
    timeout?: number;
    minRelevanceScore?: number;
}

interface ParallelSearchArgs {
    queries: string[];
    maxParallel?: number;
}

interface VisitPageArgs {
    url: string;
}

// Initialize Turndown service for converting HTML to Markdown
const turndownService = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '_',
    strongDelimiter: '**',
    linkStyle: 'inlined',
});

// Custom Turndown rules
turndownService.addRule('removeScripts', {
    filter: ['script', 'style', 'noscript'],
    replacement: () => ''
});

turndownService.addRule('preserveLinks', {
    filter: 'a',
    replacement: (content: string, node: Node) => {
        const element = node as HTMLAnchorElement;
        const href = element.getAttribute('href');
        return href ? `[${content}](${href})` : content;
    }
});

// Redirect console output to stderr to keep stdout clean for MCP communication
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
console.log = (...args) => {
    process.stderr.write(`[INFO] ${args.join(' ')}\n`);
};
console.error = (...args) => {
    process.stderr.write(`[ERROR] ${args.join(' ')}\n`);
};

const deepResearch = new DeepResearch();
let browser: Browser | undefined;
let page: Page | undefined;

const server = new Server(
    {
        name: 'mcp-deepwebresearch',
        version: '0.3.0'
    },
    {
        capabilities: {
            tools: {}
        }
    }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'deep_research',
            description: 'Perform deep research on a topic with content extraction and analysis',
            inputSchema: {
                type: 'object',
                properties: {
                    topic: {
                        type: 'string',
                        description: 'Research topic or question'
                    },
                    maxDepth: {
                        type: 'number',
                        description: 'Maximum depth of related content exploration',
                        minimum: 1,
                        maximum: 2
                    },
                    maxBranching: {
                        type: 'number',
                        description: 'Maximum number of related paths to explore',
                        minimum: 1,
                        maximum: 3
                    },
                    timeout: {
                        type: 'number',
                        description: 'Research timeout in milliseconds',
                        minimum: 30000,
                        maximum: 55000
                    },
                    minRelevanceScore: {
                        type: 'number',
                        description: 'Minimum relevance score for including content',
                        minimum: 0,
                        maximum: 1
                    }
                },
                required: ['topic']
            }
        },
        {
            name: 'parallel_search',
            description: 'Perform multiple Google searches in parallel',
            inputSchema: {
                type: 'object',
                properties: {
                    queries: {
                        type: 'array',
                        items: {
                            type: 'string'
                        },
                        description: 'Array of search queries to execute in parallel'
                    },
                    maxParallel: {
                        type: 'number',
                        description: 'Maximum number of parallel searches',
                        minimum: 1,
                        maximum: 5
                    }
                },
                required: ['queries']
            }
        },
        {
            name: 'visit_page',
            description: 'Visit a webpage and extract its content',
            inputSchema: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'URL to visit'
                    }
                },
                required: ['url']
            }
        }
    ]
}));

// Validate URL format and security
function isValidUrl(urlString: string): boolean {
    try {
        const url = new URL(urlString);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

// Safe page navigation with timeout
async function safePageNavigation(page: Page, url: string): Promise<void> {
    await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 10000 // 10 second timeout
    });

    // Quick check for bot protection or security challenges
    const validation = await page.evaluate(() => {
        const botProtectionExists = [
            '#challenge-running',
            '#cf-challenge-running',
            '#px-captcha',
            '#ddos-protection',
            '#waf-challenge-html'
        ].some(selector => document.querySelector(selector));

        const suspiciousTitle = [
            'security check',
            'ddos protection',
            'please wait',
            'just a moment',
            'attention required'
        ].some(phrase => document.title.toLowerCase().includes(phrase));

        return {
            botProtection: botProtectionExists,
            suspiciousTitle,
            title: document.title
        };
    });

    if (validation.botProtection) {
        throw new Error('Bot protection detected');
    }

    if (validation.suspiciousTitle) {
        throw new Error(`Suspicious page title detected: "${validation.title}"`);
    }
}

// Extract content as markdown
async function extractContentAsMarkdown(page: Page): Promise<string> {
    const html = await page.evaluate(() => {
        // Try standard content containers first
        const contentSelectors = [
            'main',
            'article',
            '[role="main"]',
            '#content',
            '.content',
            '.main',
            '.post',
            '.article'
        ];

        for (const selector of contentSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                return element.outerHTML;
            }
        }

        // Fallback to cleaning full body content
        const body = document.body;
        const elementsToRemove = [
            'header', 'footer', 'nav',
            '[role="navigation"]', 'aside',
            '.sidebar', '[role="complementary"]',
            '.nav', '.menu', '.header',
            '.footer', '.advertisement',
            '.ads', '.cookie-notice'
        ];

        elementsToRemove.forEach(sel => {
            body.querySelectorAll(sel).forEach(el => el.remove());
        });

        return body.outerHTML;
    });

    if (!html) {
        return '';
    }

    try {
        const markdown = turndownService.turndown(html);
        return markdown
            .replace(/\n{3,}/g, '\n\n')
            .replace(/^- $/gm, '')
            .replace(/^\s+$/gm, '')
            .trim();
    } catch (error) {
        console.error('Error converting HTML to Markdown:', error);
        return html;
    }
}

// Ensure browser is initialized
async function ensureBrowser(): Promise<Page> {
    if (!browser) {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        page = await context.newPage();
    }

    if (!page) {
        const context = await browser.newContext();
        page = await context.newPage();
    }

    return page;
}

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        switch (request.params.name) {
            case 'deep_research': {
                const args = request.params.arguments as unknown as DeepResearchArgs;
                if (!args?.topic) {
                    throw new McpError(ErrorCode.InvalidParams, 'Topic is required');
                }

                console.log(`Starting deep research on topic: ${args.topic}`);
                const result = await deepResearch.startResearch(args.topic, {
                    maxDepth: Math.min(args.maxDepth || 2, 2),
                    maxBranching: Math.min(args.maxBranching || 3, 3),
                    timeout: Math.min(args.timeout || 55000, 55000),
                    minRelevanceScore: args.minRelevanceScore || 0.7
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }

            case 'parallel_search': {
                const args = request.params.arguments as unknown as ParallelSearchArgs;
                if (!args?.queries) {
                    throw new McpError(ErrorCode.InvalidParams, 'Queries array is required');
                }

                const limitedQueries = args.queries.slice(0, 5);
                console.log(`Starting parallel search with ${limitedQueries.length} queries`);
                const result = await deepResearch.parallelSearch.parallelSearch(limitedQueries);

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }

            case 'visit_page': {
                const args = request.params.arguments as unknown as VisitPageArgs;
                if (!args?.url) {
                    throw new McpError(ErrorCode.InvalidParams, 'URL is required');
                }

                if (!isValidUrl(args.url)) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Invalid URL: ${args.url}. Only http and https protocols are supported.`
                    );
                }

                const page = await ensureBrowser();
                try {
                    await safePageNavigation(page, args.url);
                    const title = await page.title();
                    const content = await extractContentAsMarkdown(page);

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({
                                    url: args.url,
                                    title,
                                    content
                                }, null, 2)
                            }
                        ]
                    };
                } catch (error) {
                    throw new McpError(
                        ErrorCode.InternalError,
                        `Failed to visit page: ${(error as Error).message}`
                    );
                }
            }

            default:
                throw new McpError(
                    ErrorCode.MethodNotFound,
                    `Unknown tool: ${request.params.name}`
                );
        }
    } catch (error) {
        console.error('Error executing tool:', error);
        throw new McpError(
            ErrorCode.InternalError,
            error instanceof Error ? error.message : 'Unknown error occurred'
        );
    }
});

// Error handling
server.onerror = (error) => {
    console.error('[MCP Error]', error);
};

// Handle shutdown
process.on('SIGINT', async () => {
    if (browser) {
        await browser.close();
    }
    await server.close();
    process.exit(0);
});

// Start the server
const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);

console.error('MCP Web Research server running on stdio');