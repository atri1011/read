import Redis from "ioredis";

const QUEUE_NAME = "parse_jobs";

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (_redis) return _redis;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required");
  _redis = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  return _redis;
}

export type ParseJobPayload = {
  jobId: string;
  documentId: string;
};

export async function enqueueParseJob(payload: ParseJobPayload): Promise<void> {
  const redis = getRedis();
  await redis.lpush(QUEUE_NAME, JSON.stringify(payload));
}

export function parseJobsQueueName(): string {
  return QUEUE_NAME;
}
