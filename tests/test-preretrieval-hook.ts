#!/usr/bin/env tsx
/**
 * Manual test script for the UserPromptSubmit pre-retrieval hook.
 * This tests that LibGuides search runs automatically before the agent processes the query.
 *
 * Usage: tsx tests/test-preretrieval-hook.ts
 */

import { processAgentStream } from '../src/services/agentRunner.js';

async function testPreRetrievalHook() {
  console.log('Testing pre-retrieval hook integration...\n');

  // Test query that should trigger LibGuides search
  const testQuery = 'What kind of questions are you bad at answering?';

  console.log(`Query: "${testQuery}"\n`);
  console.log('Expecting LibGuides search to run automatically...\n');

  try {
    let foundPreRetrievalContext = false;
    let assistantResponse = '';

    const result = await processAgentStream({
      prompt: testQuery,
      metadata: { test: 'pre-retrieval-hook' },
      onMessage: async (message) => {
        // Look for the pre-retrieval context in message stream
        if (message.type === 'assistant') {
          const blocks = message.message?.content ?? [];
          for (const block of blocks) {
            if (block?.type === 'text') {
              const text = block.text ?? '';
              assistantResponse += text;
            }
          }
        }
      }
    });

    console.log('✓ Agent completed successfully\n');
    console.log('Response:', result.response.substring(0, 500), '...\n');

    // Check if the response includes references to library resources
    // (which would indicate the pre-retrieval context was used)
    if (result.response.includes('libguides.gc.cuny.edu') ||
        result.response.includes('Ask-a-Librarian') ||
        result.response.includes('subject liaison')) {
      console.log('✓ Response appears to reference library resources (good sign that context was used)');
    } else {
      console.log('⚠ Response does not clearly reference library resources');
      console.log('  This might mean the hook context was not used, or the agent chose not to reference it');
    }

    console.log('\nTest completed. Check logs/interactions.log for full details.');

  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  }
}

testPreRetrievalHook().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
