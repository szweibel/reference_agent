import { getLibGuidesConfig } from './dist/libguides/client.js';

async function getAccessToken(config) {
  const params = new URLSearchParams();
  params.set('client_id', config.clientId);
  params.set('client_secret', config.clientSecret);
  params.set('grant_type', 'client_credentials');

  const url = `${config.baseUrl}/oauth/token`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  const data = await response.json();
  return data.access_token;
}

async function main() {
  try {
    const config = getLibGuidesConfig();
    const token = await getAccessToken(config);

    // Fetch without status filter to see ALL guides
    const params = new URLSearchParams();
    params.set('site_id', config.siteId);

    const url = `${config.baseUrl}/guides?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });

    const guides = await response.json();

    console.log('Total guides (all statuses):', guides.length);

    const published = guides.filter(g => g.status === 1);
    const unpublished = guides.filter(g => g.status !== 1);

    console.log('Published (status=1):', published.length);
    console.log('Unpublished (status≠1):', unpublished.length);

    console.log('\nUnpublished guides:');
    for (const guide of unpublished) {
      const url = guide.friendly_url || guide.url || '';
      const isAccessibility = url.includes('accessibility');
      const marker = isAccessibility ? ' ⭐' : '';
      console.log(`- [status=${guide.status}] ${guide.name}${marker}`);
      if (url) {
        console.log(`  ${url}`);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

main();
