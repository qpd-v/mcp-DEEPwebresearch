# MCP Deep Web Research Server (v0.3.0)

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server for advanced web research.

<a href="https://glama.ai/mcp/servers/5afpizjl6x"><img width="380" height="200" src="https://glama.ai/mcp/servers/5afpizjl6x/badge" alt="Web Research Server MCP server" /></a>

## Latest Changes

- Added visit_page tool for direct webpage content extraction
- Optimized performance to work within MCP timeout limits
  * Reduced default maxDepth and maxBranching parameters
  * Improved page loading efficiency
  * Added timeout checks throughout the process
  * Enhanced error handling for timeouts

> This project is a fork of [mcp-webresearch](https://github.com/mzxrai/mcp-webresearch) by [mzxrai](https://github.com/mzxrai), enhanced with additional features for deep web research capabilities. We're grateful to the original creators for their foundational work.

Bring real-time info into Claude with intelligent search queuing, enhanced content extraction, and deep research capabilities.

## Features

- Intelligent Search Queue System
  - Batch search operations with rate limiting
  - Queue management with progress tracking
  - Error recovery and automatic retries
  - Search result deduplication

- Enhanced Content Extraction
  - TF-IDF based relevance scoring
  - Keyword proximity analysis
  - Content section weighting
  - Readability scoring
  - Improved HTML structure parsing
  - Structured data extraction
  - Better content cleaning and formatting

- Core Features
  - Google search integration
  - Webpage content extraction
  - Research session tracking
  - Markdown conversion with improved formatting

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18 (includes `npm` and `npx`)
- [Claude Desktop app](https://claude.ai/download)

## Installation

### Global Installation (Recommended)

```bash
# Install globally using npm
npm install -g mcp-deepwebresearch

# Or using yarn
yarn global add mcp-deepwebresearch

# Or using pnpm
pnpm add -g mcp-deepwebresearch
```

### Local Project Installation

```bash
# Using npm
npm install mcp-deepwebresearch

# Using yarn
yarn add mcp-deepwebresearch

# Using pnpm
pnpm add mcp-deepwebresearch
```

### Claude Desktop Integration

After installing the package, add this entry to your `claude_desktop_config.json`:

#### Windows
```json
{
  "mcpServers": {
    "deepwebresearch": {
      "command": "mcp-deepwebresearch",
      "args": []
    }
  }
}
```
Location: `%APPDATA%\Claude\claude_desktop_config.json`

#### macOS
```json
{
  "mcpServers": {
    "deepwebresearch": {
      "command": "mcp-deepwebresearch",
      "args": []
    }
  }
}
```
Location: `~/Library/Application Support/Claude/claude_desktop_config.json`

This config allows Claude Desktop to automatically start the web research MCP server when needed.

### First-time Setup

After installation, run this command to install required browser dependencies:
```bash
npx playwright install chromium
```

## Usage

Simply start a chat with Claude and send a prompt that would benefit from web research. If you'd like a prebuilt prompt customized for deeper web research, you can use the `agentic-research` prompt that we provide through this package. Access that prompt in Claude Desktop by clicking the Paperclip icon in the chat input and then selecting `Choose an integration` → `deepwebresearch` → `agentic-research`.

### Tools

1. `deep_research`
   - Performs comprehensive research with content analysis
   - Arguments:
     ```typescript
     {
       topic: string;
       maxDepth?: number;      // default: 2
       maxBranching?: number;  // default: 3
       timeout?: number;       // default: 55000 (55 seconds)
       minRelevanceScore?: number;  // default: 0.7
     }
     ```
   - Returns:
     ```typescript
     {
       findings: {
         mainTopics: Array<{name: string, importance: number}>;
         keyInsights: Array<{text: string, confidence: number}>;
         sources: Array<{url: string, credibilityScore: number}>;
       };
       progress: {
         completedSteps: number;
         totalSteps: number;
         processedUrls: number;
       };
       timing: {
         started: string;
         completed?: string;
         duration?: number;
         operations?: {
           parallelSearch?: number;
           deduplication?: number;
           topResultsProcessing?: number;
           remainingResultsProcessing?: number;
           total?: number;
         };
       };
     }
     ```

2. `parallel_search`
   - Performs multiple Google searches in parallel with intelligent queuing
   - Arguments: `{ queries: string[], maxParallel?: number }`
   - Note: maxParallel is limited to 5 to ensure reliable performance

3. `visit_page`
   - Visit a webpage and extract its content
   - Arguments: `{ url: string }`
   - Returns:
     ```typescript
     {
       url: string;
       title: string;
       content: string;  // Markdown formatted content
     }
     ```

### Prompts

#### `agentic-research`
A guided research prompt that helps Claude conduct thorough web research. The prompt instructs Claude to:
- Start with broad searches to understand the topic landscape
- Prioritize high-quality, authoritative sources
- Iteratively refine the research direction based on findings
- Keep you informed and let you guide the research interactively
- Always cite sources with URLs

## Configuration Options

The server can be configured through environment variables:

- `MAX_PARALLEL_SEARCHES`: Maximum number of concurrent searches (default: 5)
- `SEARCH_DELAY_MS`: Delay between searches in milliseconds (default: 200)
- `MAX_RETRIES`: Number of retry attempts for failed requests (default: 3)
- `TIMEOUT_MS`: Request timeout in milliseconds (default: 55000)
- `LOG_LEVEL`: Logging level (default: 'info')

## Error Handling

### Common Issues

1. Rate Limiting
   - Symptom: "Too many requests" error
   - Solution: Increase `SEARCH_DELAY_MS` or decrease `MAX_PARALLEL_SEARCHES`

2. Network Timeouts
   - Symptom: "Request timed out" error
   - Solution: Ensure requests complete within the 60-second MCP timeout

3. Browser Issues
   - Symptom: "Browser failed to launch" error
   - Solution: Ensure Playwright is properly installed (`npx playwright install`)

### Debugging

This is beta software. If you run into issues:

1. Check Claude Desktop's MCP logs:
   ```bash
   # On macOS
   tail -n 20 -f ~/Library/Logs/Claude/mcp*.log
   
   # On Windows
   Get-Content -Path "$env:APPDATA\Claude\logs\mcp*.log" -Tail 20 -Wait
   ```

2. Enable debug logging:
   ```bash
   export LOG_LEVEL=debug
   ```

## Development

### Setup

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Watch for changes
pnpm watch

# Run in development mode
pnpm dev
```

### Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

### Code Quality

```bash
# Run linter
pnpm lint

# Fix linting issues
pnpm lint:fix

# Type check
pnpm type-check
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Coding Standards

- Follow TypeScript best practices
- Maintain test coverage above 80%
- Document new features and APIs
- Update CHANGELOG.md for significant changes
- Follow semantic versioning

### Performance Considerations

- Use batch operations where possible
- Implement proper error handling and retries
- Consider memory usage with large datasets
- Cache results when appropriate
- Use streaming for large content

## Requirements

- Node.js >= 18
- Playwright (automatically installed as a dependency)

## Verified Platforms

- [x] macOS
- [x] Windows
- [ ] Linux

## License

MIT

## Credits

This project builds upon the excellent work of [mcp-webresearch](https://github.com/mzxrai/mcp-webresearch) by [mzxrai](https://github.com/mzxrai). The original codebase provided the foundation for our enhanced features and capabilities.

## Author

[qpd-v](https://github.com/qpd-v)
