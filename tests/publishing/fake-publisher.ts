import type {
  ContainerStatus,
  InstagramPublisher,
  PublishError,
  PublishResult,
} from "@/lib/instagram/publish";
import { FakePublisher } from "@/lib/instagram/publish-fake";

export { FakePublisher } from "@/lib/instagram/publish-fake";

type Methods = {
  [K in keyof InstagramPublisher]: InstagramPublisher[K] extends (
    ...args: infer A
  ) => Promise<infer R>
    ? { args: A; result: R }
    : never;
};
export type PublisherMethod = keyof Methods;

export function publishError(
  code: PublishError["code"],
  overrides: Partial<PublishError> = {},
): PublishError {
  return {
    code,
    retryable: true,
    message: "erro simulado",
    raw: null,
    httpStatus: 400,
    ...overrides,
  };
}

/**
 * Publisher whose responses are scripted per method (FIFO). When a method's queue is empty it
 * falls back to the deterministic FakePublisher. `calls` records every invocation.
 */
export class ScriptedPublisher implements InstagramPublisher {
  readonly calls: Array<{ method: PublisherMethod; args: unknown[] }> = [];
  private readonly queues = new Map<PublisherMethod, unknown[]>();
  readonly fallback: FakePublisher;

  constructor(fallback: FakePublisher = new FakePublisher()) {
    this.fallback = fallback;
  }

  /** Queue results (or functions returning results) for a method. */
  script<M extends PublisherMethod>(
    method: M,
    ...results: Array<Methods[M]["result"] | (() => Methods[M]["result"])>
  ): this {
    const q = this.queues.get(method) ?? [];
    q.push(...results);
    this.queues.set(method, q);
    return this;
  }

  /** Queue a failure for a method. */
  fail(method: PublisherMethod, error: PublishError): this {
    return this.script(method, { ok: false, error } as never);
  }

  private async run<M extends PublisherMethod>(
    method: M,
    args: Methods[M]["args"],
    fallback: () => Promise<Methods[M]["result"]>,
  ): Promise<Methods[M]["result"]> {
    this.calls.push({ method, args });
    const q = this.queues.get(method);
    if (q && q.length > 0) {
      const next = q.shift();
      return (typeof next === "function" ? next() : next) as Methods[M]["result"];
    }
    return fallback();
  }

  createImageContainer(...args: Methods["createImageContainer"]["args"]) {
    return this.run("createImageContainer", args, () => this.fallback.createImageContainer());
  }
  createVideoContainer(...args: Methods["createVideoContainer"]["args"]) {
    return this.run("createVideoContainer", args, () => this.fallback.createVideoContainer());
  }
  createCarouselContainer(...args: Methods["createCarouselContainer"]["args"]) {
    return this.run("createCarouselContainer", args, () => this.fallback.createCarouselContainer());
  }
  getContainerStatus(
    ...args: Methods["getContainerStatus"]["args"]
  ): Promise<PublishResult<ContainerStatus>> {
    return this.run("getContainerStatus", args, () => this.fallback.getContainerStatus(args[0]));
  }
  publish(...args: Methods["publish"]["args"]) {
    return this.run("publish", args, () => this.fallback.publish());
  }
  getPublishingLimit(...args: Methods["getPublishingLimit"]["args"]) {
    return this.run("getPublishingLimit", args, () => this.fallback.getPublishingLimit());
  }
  getMediaPermalink(...args: Methods["getMediaPermalink"]["args"]) {
    return this.run("getMediaPermalink", args, () => this.fallback.getMediaPermalink(args[0]));
  }
}
