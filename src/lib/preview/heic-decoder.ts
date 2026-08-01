// `?worker` so Vite emits the worker as its own chunk and hands back a URL that
// respects `base`. Constructing one from a hand-written path would 404 under
// /aperture/ in production.
import HeicWorker from "./heic-worker?worker";
import type { HeicWorkerRequest, HeicWorkerResponse } from "./protocol";

/**
 * A pool of HEIC decoders and the queue in front of them.
 *
 * Decoding is ~600 ms of CPU per 12 MP photo and allocates 46 MB of RGBA while
 * it runs, so this is deliberately not "start one per tile and let the browser
 * sort it out": a screen of iPhone photos would ask for thirty at once and take
 * the tab down with it. Work is queued, a couple of workers at a time drain it,
 * and anything still queued when its tile scrolls away is dropped.
 */

/** Two spare cores at most. Each worker's wasm heap grows to hold a whole photo. */
const MAX_WORKERS = 3;

/** Thrown into `decode()`'s promise when a job is cancelled before it runs. */
export class DecodeCancelled extends Error {
  constructor() {
    super("HEIC decode cancelled.");
    this.name = "DecodeCancelled";
  }
}

export interface DecodeHandle {
  promise: Promise<Blob>;
  /**
   * Give up on this decode. A job that has not started is dropped outright; one
   * already inside the wasm decoder cannot be interrupted, so it runs to
   * completion and its result is discarded — but the caller is released now
   * either way.
   */
  cancel: () => void;
}

interface Job {
  id: number;
  file: File;
  cancelled: boolean;
  resolve: (blob: Blob) => void;
  reject: (cause: unknown) => void;
}

function poolSize(): number {
  const cores = globalThis.navigator?.hardwareConcurrency ?? 4;
  return Math.max(1, Math.min(MAX_WORKERS, cores - 1));
}

export class HeicDecoder {
  private readonly limit: number;
  private readonly idle: Worker[] = [];
  private readonly all: Worker[] = [];
  private readonly queue: Job[] = [];
  /** Jobs dispatched to a worker, by id. */
  private readonly running = new Map<number, Job>();
  /**
   * Every job that has not settled — including the moment between leaving the
   * queue and reaching a worker, which is a real `await` on reading the file and
   * is where a job would otherwise be invisible to `dispose()`.
   */
  private readonly live = new Set<Job>();
  private nextId = 1;
  private disposed = false;

  constructor(limit = poolSize()) {
    this.limit = limit;
  }

  /** Jobs waiting on a worker. Test affordance. */
  get queued(): number {
    return this.queue.length;
  }

  decode(file: File): DecodeHandle {
    if (this.disposed) {
      return {
        promise: Promise.reject(new DecodeCancelled()),
        cancel: () => {},
      };
    }

    const id = this.nextId++;
    let job!: Job;
    const promise = new Promise<Blob>((resolve, reject) => {
      job = { id, file, cancelled: false, resolve, reject };
    });

    this.live.add(job);
    this.queue.push(job);
    this.pump();

    return { promise, cancel: () => this.abandon(job) };
  }

  /** Terminate every worker. Their wasm heaps stay as big as the largest photo they have seen. */
  dispose(): void {
    this.disposed = true;
    for (const worker of this.all) worker.terminate();
    this.all.length = 0;
    this.idle.length = 0;
    this.queue.length = 0;
    this.running.clear();

    for (const job of this.live) this.abandon(job);
  }

  private abandon(job: Job): void {
    if (job.cancelled) return;
    job.cancelled = true;
    this.live.delete(job);
    const at = this.queue.indexOf(job);
    if (at !== -1) this.queue.splice(at, 1);
    job.reject(new DecodeCancelled());
  }

  private pump(): void {
    while (this.queue.length > 0) {
      const worker = this.take();
      if (!worker) return;
      void this.dispatch(worker, this.queue.shift()!);
    }
  }

  /** A free worker, spinning up a new one while the pool is under its limit. */
  private take(): Worker | null {
    const spare = this.idle.pop();
    if (spare) return spare;
    if (this.all.length >= this.limit) return null;

    const worker = new HeicWorker();
    worker.onmessage = (event: MessageEvent<HeicWorkerResponse>) => this.settle(worker, event.data);
    this.all.push(worker);
    return worker;
  }

  private async dispatch(worker: Worker, job: Job): Promise<void> {
    // Read the bytes only now, so a job cancelled while queued never touched disk.
    let bytes: ArrayBuffer;
    try {
      bytes = await job.file.arrayBuffer();
    } catch (cause) {
      this.release(worker);
      this.live.delete(job);
      if (!job.cancelled) job.reject(cause);
      return;
    }

    if (job.cancelled || this.disposed) {
      this.release(worker);
      return;
    }

    this.running.set(job.id, job);
    const request: HeicWorkerRequest = { id: job.id, bytes };
    worker.postMessage(request, [bytes]);
  }

  private settle(worker: Worker, response: HeicWorkerResponse): void {
    const job = this.running.get(response.id);
    this.running.delete(response.id);
    this.release(worker);
    if (job) this.live.delete(job);

    // Cancelled mid-decode: the caller has already been rejected, so the result
    // is simply dropped.
    if (!job || job.cancelled) return;

    if (response.ok) job.resolve(response.blob);
    else job.reject(new Error(response.message));
  }

  private release(worker: Worker): void {
    if (this.disposed) return;
    this.idle.push(worker);
    this.pump();
  }
}
