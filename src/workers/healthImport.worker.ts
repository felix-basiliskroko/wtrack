import { parseAppleHealthExport } from '../services/healthImportParser';
import { HealthImportOptions } from '../types';

type WorkerRequest = {
  id: string;
  file: File;
  options: HealthImportOptions;
};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, file, options } = event.data;
  try {
    const snapshot = await parseAppleHealthExport(file, options, (progress) => {
      self.postMessage({ id, type: 'progress', progress });
    });
    self.postMessage({ id, type: 'complete', snapshot });
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : 'Apple Health import failed.',
    });
  }
};
