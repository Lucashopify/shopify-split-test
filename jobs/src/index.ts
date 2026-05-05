/**
 * BullMQ worker entry point.
 * Starts all job workers. In production, run this as a separate process
 * alongside the Remix app (e.g. separate Fly.io machine or Railway service).
 */
import { startRollupWorker } from "./rollup.js";
import { startReconcileWorker } from "./reconcile.js";

console.log("[jobs] Starting workers...");

startRollupWorker();
startReconcileWorker();

console.log("[jobs] Workers running");
