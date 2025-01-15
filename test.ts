import { readFile } from 'fs/promises';
import { ContentExtractor } from './src/core/content-extractor.js';

async function runTest() {
    try {
        // Read the test HTML file
        const html = await readFile('test.html', 'utf-8');
        
        // Create an instance of ContentExtractor
        const extractor = new ContentExtractor();
        
        // Extract content
        const result = await extractor.extract(html, 'test.html');
        
        // Display the results
        console.log('Extracted Content:');
        console.log('=================\n');
        console.log(result.content);
        
        console.log('\nMetadata:');
        console.log('=========');
        console.log(JSON.stringify(result.metadata, null, 2));
        
    } catch (error) {
        console.error('Error running test:', error);
    }
}

runTest();