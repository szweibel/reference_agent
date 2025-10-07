import { createInterface } from 'node:readline';
import { runAgent } from './services/agentRunner.js';

async function readUserPrompt(): Promise<string> {
  const messageFromArgs = process.argv.slice(2).join(' ').trim();
  if (messageFromArgs) {
    return messageFromArgs;
  }

  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Patron question: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function run(): Promise<void> {
  const userPrompt = await readUserPrompt();
  if (!userPrompt) {
    console.error('No patron question provided. Exiting.');
    process.exit(1);
    return;
  }

  let sawStreamedChunk = false;

  try {
    const { response, streamed } = await runAgent({
      prompt: userPrompt,
      metadata: { source: 'cli' },
      onTextChunk: (chunk) => {
        sawStreamedChunk = true;
        process.stdout.write(chunk);
      }
    });

    if (!streamed && response) {
      process.stdout.write(response);
    }

    if (response && !response.endsWith('\n')) {
      process.stdout.write('\n');
    }
  } catch (error) {
    if (sawStreamedChunk) {
      process.stdout.write('\n');
    }
    console.error('Error while running agent:', error);
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('Unhandled error:', error);
  process.exitCode = 1;
});
