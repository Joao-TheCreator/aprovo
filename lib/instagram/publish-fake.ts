/**
 * In-memory, deterministic InstagramPublisher for e2e/local runs without Meta
 * (IG_PUBLISHER=fake). Production-safe: no network, no secrets.
 */
import type { ContainerStatus, InstagramPublisher, PublishResult } from "./publish";

export type FakePublisherOptions = {
  /** Status polls before a container becomes FINISHED (default 1 = FINISHED on first poll). */
  pollsUntilFinished?: number;
  quotaTotal?: number;
};

const ok = <T>(data: T): PublishResult<T> => ({ ok: true, data });

export class FakePublisher implements InstagramPublisher {
  private readonly pollsUntilFinished: number;
  private readonly quotaTotal: number;
  private containerSeq = 0;
  private mediaSeq = 0;
  private readonly polls = new Map<string, number>();
  readonly published: string[] = [];

  constructor(options: FakePublisherOptions = {}) {
    this.pollsUntilFinished = options.pollsUntilFinished ?? 1;
    this.quotaTotal = options.quotaTotal ?? 100;
  }

  private newContainer(): PublishResult<{ id: string }> {
    this.containerSeq += 1;
    const id = `fake_container_${this.containerSeq}`;
    this.polls.set(id, 0);
    return ok({ id });
  }

  async createImageContainer() {
    return this.newContainer();
  }

  async createVideoContainer() {
    return this.newContainer();
  }

  async createCarouselContainer() {
    return this.newContainer();
  }

  async getContainerStatus(containerId: string): Promise<PublishResult<ContainerStatus>> {
    const n = (this.polls.get(containerId) ?? 0) + 1;
    this.polls.set(containerId, n);
    const finished = n >= this.pollsUntilFinished;
    return ok({
      status: finished ? "FINISHED" : "IN_PROGRESS",
      detail: finished ? "Finished" : "In progress",
    });
  }

  async publish() {
    this.mediaSeq += 1;
    const igMediaId = `fake_${this.mediaSeq}`;
    this.published.push(igMediaId);
    return ok({ igMediaId });
  }

  async getPublishingLimit() {
    return ok({ quotaUsage: this.published.length, quotaTotal: this.quotaTotal });
  }

  async getMediaPermalink(igMediaId: string) {
    const n = igMediaId.replace(/^fake_/, "");
    return ok<string | null>(`https://www.instagram.com/p/FAKE${n}/`);
  }
}

let shared: FakePublisher | null = null;

/** Process-wide instance so state survives across calls (e.g. separate cron invocations). */
export function sharedFakePublisher(): FakePublisher {
  shared ??= new FakePublisher();
  return shared;
}
