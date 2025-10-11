#!/usr/bin/env ts-node

import { searchGuides } from '../src/libguides/client.js';

async function testSearchGuides() {
  console.log('Testing SearchGuides API...\n');

  try {
    // Test 1: Search for "copy machine"
    console.log('Test 1: Searching for "copy machine"...');
    const result1 = await searchGuides({
      search: 'copy machine',
      fullTextSearch: true,
      limit: 2
    });

    console.log(`Found ${result1.total} guide(s)`);
    for (const guide of result1.guides) {
      console.log(`\n- ${guide.name} (ID: ${guide.id})`);
      console.log(`  URL: ${guide.friendly_url || guide.url}`);

      if (guide.pages) {
        console.log(`  Pages: ${guide.pages.length}`);
        for (const page of guide.pages) {
          console.log(`    - ${page.name}`);
          if (page.boxes) {
            console.log(`      Boxes: ${page.boxes.length}`);
          }
        }
      }
    }

    // Test 2: Search for "circulation"
    console.log('\n\nTest 2: Searching for "circulation"...');
    const result2 = await searchGuides({
      search: 'circulation',
      fullTextSearch: true,
      limit: 1
    });

    console.log(`Found ${result2.total} guide(s)`);
    if (result2.guides.length > 0) {
      const guide = result2.guides[0];
      console.log(`\n- ${guide.name}`);

      if (guide.pages && guide.pages.length > 0) {
        const firstPage = guide.pages[0];
        console.log(`  First page: ${firstPage.name}`);

        if (firstPage.boxes && firstPage.boxes.length > 0) {
          console.log(`  First box content preview:`);
          const content = firstPage.boxes[0].body || firstPage.boxes[0].content || '';
          const preview = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
          console.log(`    ${preview}...`);
        }
      }
    }

    console.log('\n✓ Tests completed successfully!');
  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  }
}

testSearchGuides();
