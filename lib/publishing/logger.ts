/**
 * Structured logs for the scheduler (docs/12 section 5.2). Only ids, codes and durations:
 * never a token, a signed URL or a Meta body.
 */
export type PublishingLogFields = {
  run_id?: string;
  publication_id?: string;
  post_id?: string;
  connection_id?: string | null;
  attempt?: number;
  outcome?: string;
  code?: string | null;
  duration_ms?: number;
  detail?: string;
};

export function logInfo(event: string, fields: PublishingLogFields = {}): void {
  console.info(JSON.stringify({ event, ...fields }));
}

export function logWarn(event: string, fields: PublishingLogFields = {}): void {
  console.warn(JSON.stringify({ event, ...fields }));
}
