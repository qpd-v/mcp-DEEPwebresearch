# MCP Deep Web Research Server (v0.2.7)

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server for advanced web research.

## Latest Changes

- Improved markdown conversion using html-to-md
  * Better handling of tables, lists, and code blocks
  * Improved spacing and formatting
  * Enhanced content readability
  * Better HTML structure preservation

> This project is a fork of [mcp-webresearch](https://github.com/mzxrai/mcp-webresearch) by [mzxrai](https://github.com/mzxrai), enhanced with additional features for deep web research capabilities. We're grateful to the original creators for their foundational work.

Bring real-time info into Claude with intelligent search queuing, enhanced content extraction, and deep research capabilities.

## Features

- Intelligent Search Queue System
  - Batch search operations with rate limiting
  - Queue management with progress tracking
  - Error recovery and automatic retries
  - Search result deduplication
  - Queue persistence between sessions

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
  - Screenshot capture
  - Markdown conversion with improved formatting

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18 (includes `npm` and `npx`)
- [Claude Desktop app](https://claude.ai/download)

## Installation

First, ensure you've downloaded and installed the [Claude Desktop app](https://claude.ai/download) and you have npm installed.

Next, add this entry to your `claude_desktop_config.json` (on Mac, found at `~/Library/Application\ Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "deepwebresearch": {
      "command": "npx",
      "args": ["-y", "@qpd-v/mcp-DEEPwebresearch@latest"]
    }
  }
}
```

This config allows Claude Desktop to automatically start the web research MCP server when needed.

## Usage

Simply start a chat with Claude and send a prompt that would benefit from web research. If you'd like a prebuilt prompt customized for deeper web research, you can use the `agentic-research` prompt that we provide through this package. Access that prompt in Claude Desktop by clicking the Paperclip icon in the chat input and then selecting `Choose an integration` → `deepwebresearch` → `agentic-research`.

### Tools

1. `search_google`
   - Performs Google searches and extracts results
   - Arguments:
     ```typescript
     {
       query: string;
       maxResults?: number;    // default: 10
       includeSnippets?: boolean;  // default: true
     }
     ```

2. `deep_research`
   - Performs comprehensive research with content analysis
   - Arguments:
     ```typescript
     {
       topic: string;
       maxDepth?: number;      // default: 3
       maxBranching?: number;  // default: 5
       timeout?: number;       // default: 300000 (5 minutes)
       minRelevanceScore?: number;  // default: 0.5
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
     }
     ```

2. `parallel_search`
   - Performs multiple Google searches in parallel with intelligent queuing
   - Arguments: `{ queries: string[], maxParallel?: number }`

3. `visit_page`
   - Visits a webpage and extracts its content with enhanced relevance scoring
   - Arguments: `{ url: string, takeScreenshot?: boolean }`

4. `take_screenshot`
   - Takes a screenshot of the current page
   - No arguments required

5. `get_queue_status`
   - Check the status of pending searches
   - No arguments required

6. `cancel_search`
   - Cancel pending searches in the queue
   - Arguments: `{ searchId?: string }` (omit searchId to cancel all)

### Prompts

#### `agentic-research`
A guided research prompt that helps Claude conduct thorough web research. The prompt instructs Claude to:
- Start with broad searches to understand the topic landscape
- Prioritize high-quality, authoritative sources
- Iteratively refine the research direction based on findings
- Keep you informed and let you guide the research interactively
- Always cite sources with URLs

### Resources

We expose two things as MCP resources: (1) captured webpage screenshots, and (2) the research session.

#### Screenshots

When you take a screenshot, it's saved as an MCP resource. You can access captured screenshots in Claude Desktop via the Paperclip icon.

#### Research Session

The server maintains a research session that includes:
- Search queries and their results
- Queue status and history
- Visited pages with relevance scores
- Extracted content with structure analysis
- Screenshots
- Timestamps

### Suggestions

For the best results, if you choose not to use the `agentic-research` prompt when doing your research, it may be helpful to:
1. Use batch searches for broader topic coverage
2. Leverage the queue system for extensive research
3. Monitor search progress with queue status
4. Suggest high-quality sources for Claude to use

## Configuration Options

The server can be configured through environment variables:

- `MAX_PARALLEL_SEARCHES`: Maximum number of concurrent searches (default: 10)
- `SEARCH_DELAY_MS`: Delay between searches in milliseconds (default: 200)
- `MAX_RETRIES`: Number of retry attempts for failed requests (default: 3)
- `TIMEOUT_MS`: Request timeout in milliseconds (default: 30000)
- `LOG_LEVEL`: Logging level (default: 'info')

## Error Handling

### Common Issues

1. Rate Limiting
   - Symptom: "Too many requests" error
   - Solution: Increase `SEARCH_DELAY_MS` or decrease `MAX_PARALLEL_SEARCHES`

2. Network Timeouts
   - Symptom: "Request timed out" error
   - Solution: Increase `TIMEOUT_MS` or check network connection

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