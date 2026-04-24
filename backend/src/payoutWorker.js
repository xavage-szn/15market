const axios = require('axios');

const API_BASE = process.env.BACKEND_INTERNAL_URL || `http://127.0.0.1:${process.env.PORT || 3010}`;
const POLL_MS = Number(process.env.PAYOUT_WORKER_POLL_MS || 15);
const CLAIM_LIMIT = Number(process.env.PAYOUT_WORKER_BATCH_SIZE || 32);

async function claimJobs() {
  const url = `${API_BASE}/internal/payout-jobs/claim`;
  const { data } = await axios.get(url, { params: { limit: CLAIM_LIMIT }, timeout: 2000 });
  return data.jobs || [];
}

async function completeJob(jobId) {
  const url = `${API_BASE}/internal/payout-jobs/complete`;
  await axios.post(url, { jobId }, { timeout: 2000 });
}

async function cycle() {
  try {
    const jobs = await claimJobs();
    if (jobs.length === 0) return;
    await Promise.allSettled(jobs.map((job) => completeJob(job.jobId)));
  } catch (err) {
    // Keep worker hot; transient network errors should not crash process.
  }
}

setInterval(cycle, Math.max(5, POLL_MS));
console.log(`[PayoutWorker] polling ${API_BASE} every ${Math.max(5, POLL_MS)}ms`);
