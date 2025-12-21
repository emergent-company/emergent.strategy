/**
 * Job Queue utilities for background job processing.
 *
 * Provides a base class for implementing job queue services with common functionality:
 * - Idempotent enqueue
 * - Atomic dequeue with FOR UPDATE SKIP LOCKED
 * - Exponential backoff for retries
 * - Stale job recovery
 * - Queue statistics
 */

export * from './base-job-queue.service';
