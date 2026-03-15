import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const envPath = process.env.RUNPOD_ENV_FILE || path.join(repoRoot, 'deploy', 'runpod-qwen', '.env');

dotenv.config({ path: envPath });

const apiKey = process.env.RUNPOD_API_KEY;
if (!apiKey) {
  console.error(`Missing RUNPOD_API_KEY. Put it in ${envPath} or set RUNPOD_ENV_FILE.`);
  process.exit(1);
}

const podName = process.env.RUNPOD_POD_NAME || 'cindy-qwen';
const cloudType = process.env.RUNPOD_CLOUD_TYPE || 'SECURE';
const gpuType = process.env.RUNPOD_GPU_TYPE || 'NVIDIA RTX A4000';
const gpuCount = Number.parseInt(process.env.RUNPOD_GPU_COUNT || '1', 10);
const port = Number.parseInt(process.env.RUNPOD_PORT || '8000', 10);
const volumeInGb = Number.parseInt(process.env.RUNPOD_VOLUME_GB || '80', 10);
const containerDiskInGb = Number.parseInt(process.env.RUNPOD_CONTAINER_DISK_GB || '50', 10);
const datacenterId = process.env.RUNPOD_DATACENTER_ID || undefined;
const modelId = process.env.RUNPOD_MODEL_ID || 'Qwen/Qwen2.5-3B-Instruct';
const servedModelName = process.env.RUNPOD_SERVED_MODEL_NAME || modelId;
const maxModelLen = process.env.RUNPOD_MAX_MODEL_LEN || '8192';
const gpuMemoryUtilization = process.env.RUNPOD_GPU_MEMORY_UTILIZATION || '0.9';
const hfToken = process.env.HF_TOKEN || '';
const vllmApiKey = process.env.VLLM_API_KEY || crypto.randomBytes(24).toString('hex');

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

const mutation = `
  mutation SaveTemplateAndCreatePod($input: PodFindAndDeployOnDemandInput!) {
    podFindAndDeployOnDemand(input: $input) {
      id
      name
      imageName
      machineId
      desiredStatus
    }
  }
`;

const env = [];
if (hfToken) {
  env.push({ key: 'HUGGING_FACE_HUB_TOKEN', value: hfToken });
  env.push({ key: 'HF_TOKEN', value: hfToken });
}

const input = {
  cloudType,
  computeType: 'GPU',
  containerDiskInGb,
  volumeInGb,
  gpuCount,
  gpuTypeIds: [gpuType],
  gpuTypePriority: 'availability',
  imageName: 'vllm/vllm-openai:latest',
  interruptible: false,
  name: podName,
  ports: [`${port}/http`],
  startJupyter: false,
  startSsh: false,
  supportPublicIp: true,
  volumeMountPath: '/workspace',
  dockerStartCmd: [
    '--host',
    '0.0.0.0',
    '--port',
    String(port),
    '--model',
    modelId,
    '--served-model-name',
    servedModelName,
    '--api-key',
    vllmApiKey,
    '--max-model-len',
    String(maxModelLen),
    '--gpu-memory-utilization',
    String(gpuMemoryUtilization),
    '--download-dir',
    '/workspace/hf-cache'
  ],
  env
};

if (datacenterId) {
  input.dataCenterId = datacenterId;
}

try {
  const data = await runpodRequest(mutation, { input });
  const pod = data.podFindAndDeployOnDemand;
  const endpoint = `https://${pod.id}-${port}.proxy.runpod.net/v1`;

  console.log('Runpod Pod created.');
  console.log(`Pod ID: ${pod.id}`);
  console.log(`Pod Name: ${pod.name}`);
  console.log(`Public API Base URL: ${endpoint}`);
  console.log('');
  console.log('Save this API key somewhere safe. CINDY will need the same value:');
  console.log(`VLLM_API_KEY=${vllmApiKey}`);
  console.log('');
  console.log('Set these in Render after the pod is healthy:');
  console.log(`AI_PROVIDER=custom`);
  console.log(`AI_BASE_URL=${endpoint}`);
  console.log(`AI_API_KEY=${vllmApiKey}`);
  console.log(`AI_MODEL=${servedModelName}`);
  console.log('');
  console.log('Next: run `npm run runpod:check-qwen` after a few minutes to test the endpoint.');
} catch (error) {
  console.error(`Failed to create Runpod Pod: ${error.message}`);
  process.exit(1);
}
