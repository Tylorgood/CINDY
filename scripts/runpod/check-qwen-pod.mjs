import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const envPath = process.env.RUNPOD_ENV_FILE || path.join(repoRoot, 'deploy', 'runpod-qwen', '.env');

dotenv.config({ path: envPath });

const apiKey = process.env.RUNPOD_API_KEY;
const podId = process.env.RUNPOD_POD_ID;
const port = Number.parseInt(process.env.RUNPOD_PORT || '8000', 10);
const vllmApiKey = process.env.VLLM_API_KEY;

if (!apiKey || !podId) {
  console.error('Missing RUNPOD_API_KEY or RUNPOD_POD_ID.');
  process.exit(1);
}

async function runpodRequest(query, variables = {}) {
  const response = await fetch('https://api.runpod.io/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new Error(`Runpod API returned ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map(error => error.message).join('; '));
  }

  return payload.data;
}

const query = `
  query Pod($input: PodFilter) {
    myself {
      pods(input: $input) {
        id
        name
        desiredStatus
        runtime {
          uptimeInSeconds
          ports {
            ip
            isIpPublic
            privatePort
            publicPort
            type
          }
        }
      }
    }
  }
`;

try {
  const data = await runpodRequest(query, { input: { podId } });
  const pod = data.myself?.pods?.[0];

  if (!pod) {
    throw new Error(`No pod found for RUNPOD_POD_ID=${podId}`);
  }

  const endpoint = `https://${podId}-${port}.proxy.runpod.net/v1`;

  console.log(`Pod: ${pod.name} (${pod.id})`);
  console.log(`Desired Status: ${pod.desiredStatus}`);
  console.log(`Uptime (seconds): ${pod.runtime?.uptimeInSeconds ?? 0}`);
  console.log(`Expected API Base URL: ${endpoint}`);

  if (!vllmApiKey) {
    console.log('VLLM_API_KEY not set, so endpoint auth test was skipped.');
    process.exit(0);
  }

  const response = await fetch(`${endpoint}/models`, {
    headers: {
      Authorization: `Bearer ${vllmApiKey}`
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Model endpoint returned ${response.status}: ${body}`);
  }

  const payload = await response.json();
  const modelIds = (payload.data || []).map(model => model.id);

  console.log('Endpoint is live.');
  console.log(`Served models: ${modelIds.join(', ')}`);
} catch (error) {
  console.error(`Runpod pod check failed: ${error.message}`);
  process.exit(1);
}
