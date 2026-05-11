import { HealthImportOptions, HealthSnapshot } from '../types';
import HealthImportWorker from '../workers/healthImport.worker?worker';

type ImportProgress = {
  phase: string;
  processedBytes?: number;
  totalBytes?: number;
};

type WorkerResponse =
  | { id: string; type: 'progress'; progress: ImportProgress }
  | { id: string; type: 'complete'; snapshot: HealthSnapshot }
  | { id: string; type: 'error'; error: string };

export function parseHealthExportInWorker(
  file: File,
  options: HealthImportOptions,
  onProgress: (progress: ImportProgress) => void,
) {
  return new Promise<HealthSnapshot>((resolve, reject) => {
    const worker = new HealthImportWorker();
    const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return;
      if (event.data.type === 'progress') onProgress(event.data.progress);
      if (event.data.type === 'complete') {
        worker.terminate();
        resolve(event.data.snapshot);
      }
      if (event.data.type === 'error') {
        worker.terminate();
        reject(new Error(event.data.error));
      }
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message));
    };

    worker.postMessage({ id, file, options });
  });
}
