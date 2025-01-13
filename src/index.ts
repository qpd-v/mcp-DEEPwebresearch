#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError
} from '@modelcontextprotocol/sdk/types.js';

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

const server = new Server(
    {
        name: 'mcp-webresearch',
        version: '1.0.0'
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
                        maximum: 5
                    },
                    maxBranching: {
                        type: 'number',
                        description: 'Maximum number of related paths to explore',
                        minimum: 1,
                        maximum: 10
                    },
                    timeout: {
                        type: 'number',
                        description: 'Research timeout in milliseconds',
                        minimum: 30000
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
                        maximum: 10
                    }
                },
                required: ['queries']
            }
        }
    ]
}));

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
                    maxDepth: args.maxDepth,
                    maxBranching: args.maxBranching,
                    timeout: args.timeout,
                    minRelevanceScore: args.minRelevanceScore
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

                console.log(`Starting parallel search with ${args.queries.length} queries`);
                const result = await deepResearch.parallelSearch.parallelSearch(args.queries);

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
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
    await server.close();
    process.exit(0);
});

// Start the server
const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);

console.error('MCP Web Research server running on stdio');