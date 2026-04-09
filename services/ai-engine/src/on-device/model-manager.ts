// =============================================================================
// Vieanna — On-Device Model Lifecycle Manager
// =============================================================================
// Downloads, caches, versions, and manages ONNX models for on-device inference.
// Models stored in IndexedDB for persistence across sessions. Auto-updates
// from CDN with differential updates. Handles memory pressure gracefully.

import type { ModelManifest, ModelCapability } from './edge-ai.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CachedModel {
  id: string;
  version: string;
  data: ArrayBuffer;
  sha256: string;
  cachedAt: number;
  lastUsedAt: number;
  sizeBytes: number;
  capabilities: ModelCapability[];
  loadedInMemory: boolean;
}

export interface ModelUpdateCheck {
  modelId: string;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  updateSizeBytes: number;
  releaseNotes: string;
}

export interface ModelManagerConfig {
  /** CDN base URL for model downloads */
  cdnBaseUrl: string;
  /** IndexedDB database name for model cache */
  dbName?: string;
  /** Maximum total cache size in bytes (default: 200MB) */
  maxCacheSizeBytes?: number;
  /** Maximum models loaded in memory simultaneously (default: 3) */
  maxModelsInMemory?: number;
  /** Auto-check for updates interval in ms (default: 24 hours) */
  updateCheckIntervalMs?: number;
}

export interface DownloadProgress {
  modelId: string;
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
}

// ─── Model Manager ──────────────────────────────────────────────────────────

const MODEL_DB_NAME = 'vieanna-models';
const MODEL_STORE = 'models';
const MANIFEST_STORE = 'manifests';
const MODEL_DB_VERSION = 1;

export class ModelManager {
  private readonly config: Required<ModelManagerConfig>;
  private db: IDBDatabase | null = null;
  private loadedModels = new Map<string, ArrayBuffer>();
  private updateTimer: ReturnType<typeof setInterval> | null = null;
  private progressListeners: Array<(progress: DownloadProgress) => void> = [];

  constructor(config: ModelManagerConfig) {
    this.config = {
      cdnBaseUrl: config.cdnBaseUrl,
      dbName: config.dbName ?? MODEL_DB_NAME,
      maxCacheSizeBytes: config.maxCacheSizeBytes ?? 200 * 1024 * 1024,
      maxModelsInMemory: config.maxModelsInMemory ?? 3,
      updateCheckIntervalMs: config.updateCheckIntervalMs ?? 24 * 60 * 60 * 1000,
    };
  }

  async initialize(): Promise<void> {
    await this.openDb();
  }

  private async openDb(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.dbName, MODEL_DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(MODEL_STORE)) {
          const store = db.createObjectStore(MODEL_STORE, { keyPath: 'id' });
          store.createIndex('lastUsedAt', 'lastUsedAt', { unique: false });
          store.createIndex('sizeBytes', 'sizeBytes', { unique: false });
        }
        if (!db.objectStoreNames.contains(MANIFEST_STORE)) {
          db.createObjectStore(MANIFEST_STORE, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = () => reject(new Error(`Failed to open model DB: ${request.error?.message}`));
    });
  }

  /**
   * Get a model's ArrayBuffer, downloading if not cached.
   */
  async getModel(manifest: ModelManifest): Promise<ArrayBuffer> {
    // Check in-memory first
    const inMemory = this.loadedModels.get(manifest.id);
    if (inMemory) {
      await this.updateLastUsed(manifest.id);
      return inMemory;
    }

    // Check IndexedDB cache
    const cached = await this.getCachedModel(manifest.id);
    if (cached && cached.version === manifest.version) {
      await this.loadIntoMemory(manifest.id, cached.data);
      return cached.data;
    }

    // Download from CDN
    const data = await this.downloadModel(manifest);
    await this.cacheModel(manifest, data);
    await this.loadIntoMemory(manifest.id, data);
    return data;
  }

  /**
   * Pre-load models into memory on app start for zero-latency inference.
   */
  async warmup(manifests: ModelManifest[]): Promise<void> {
    const sorted = manifests.slice().sort((a, b) => a.sizeBytes - b.sizeBytes);
    for (const manifest of sorted) {
      if (this.loadedModels.size >= this.config.maxModelsInMemory) break;
      try {
        await this.getModel(manifest);
      } catch {
        // Non-critical — model will be loaded on demand
      }
    }
  }

  /**
   * Check for model updates from CDN.
   */
  async checkForUpdates(currentManifests: ModelManifest[]): Promise<ModelUpdateCheck[]> {
    const results: ModelUpdateCheck[] = [];

    try {
      const response = await fetch(`${this.config.cdnBaseUrl}/manifests/latest.json`);
      if (!response.ok) return results;

      const latest = (await response.json()) as Record<string, { version: string; sizeBytes: number; releaseNotes: string }>;

      for (const manifest of currentManifests) {
        const update = latest[manifest.id];
        if (update && update.version !== manifest.version) {
          results.push({
            modelId: manifest.id,
            currentVersion: manifest.version,
            latestVersion: update.version,
            updateAvailable: true,
            updateSizeBytes: update.sizeBytes,
            releaseNotes: update.releaseNotes,
          });
        }
      }
    } catch {
      // Network error — skip update check
    }

    return results;
  }

  /**
   * Start automatic update checking.
   */
  startAutoUpdate(manifests: ModelManifest[]): void {
    if (this.updateTimer) return;
    this.updateTimer = setInterval(async () => {
      const updates = await this.checkForUpdates(manifests);
      for (const update of updates) {
        const manifest = manifests.find((m) => m.id === update.modelId);
        if (manifest) {
          const updated: ModelManifest = { ...manifest, version: update.latestVersion };
          try {
            await this.downloadModel(updated);
            await this.cacheModel(updated, await this.getModel(updated));
          } catch {
            // Will retry next interval
          }
        }
      }
    }, this.config.updateCheckIntervalMs);
  }

  stopAutoUpdate(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  /**
   * Evict least-recently-used models when cache exceeds size limit.
   */
  async evictIfNeeded(): Promise<number> {
    const allModels = await this.getAllCachedModels();
    const totalSize = allModels.reduce((sum, m) => sum + m.sizeBytes, 0);

    if (totalSize <= this.config.maxCacheSizeBytes) return 0;

    // Sort by lastUsedAt ascending (oldest first)
    allModels.sort((a, b) => a.lastUsedAt - b.lastUsedAt);

    let freed = 0;
    let currentSize = totalSize;

    for (const model of allModels) {
      if (currentSize <= this.config.maxCacheSizeBytes * 0.8) break; // Evict to 80%
      await this.deleteCachedModel(model.id);
      this.loadedModels.delete(model.id);
      currentSize -= model.sizeBytes;
      freed += model.sizeBytes;
    }

    return freed;
  }

  /**
   * Unload a model from memory (keeps in IndexedDB cache).
   */
  unloadFromMemory(modelId: string): void {
    this.loadedModels.delete(modelId);
  }

  /**
   * Listen to download progress events.
   */
  onProgress(listener: (progress: DownloadProgress) => void): () => void {
    this.progressListeners.push(listener);
    return () => {
      this.progressListeners = this.progressListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Get cache statistics.
   */
  async getCacheStats(): Promise<{
    modelCount: number;
    totalSizeBytes: number;
    modelsInMemory: number;
    maxCacheSize: number;
    utilizationPercent: number;
  }> {
    const models = await this.getAllCachedModels();
    const totalSize = models.reduce((sum, m) => sum + m.sizeBytes, 0);
    return {
      modelCount: models.length,
      totalSizeBytes: totalSize,
      modelsInMemory: this.loadedModels.size,
      maxCacheSize: this.config.maxCacheSizeBytes,
      utilizationPercent: (totalSize / this.config.maxCacheSizeBytes) * 100,
    };
  }

  // ─── Private Methods ──────────────────────────────────────────────────

  private async downloadModel(manifest: ModelManifest): Promise<ArrayBuffer> {
    const response = await fetch(manifest.downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download model ${manifest.id}: ${response.status}`);
    }

    const contentLength = Number(response.headers.get('content-length') ?? manifest.sizeBytes);
    const reader = response.body?.getReader();
    if (!reader) {
      return response.arrayBuffer();
    }

    const chunks: Uint8Array[] = [];
    let downloaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      downloaded += value.length;

      for (const listener of this.progressListeners) {
        listener({
          modelId: manifest.id,
          bytesDownloaded: downloaded,
          totalBytes: contentLength,
          percentage: (downloaded / contentLength) * 100,
        });
      }
    }

    const combined = new Uint8Array(downloaded);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    return combined.buffer;
  }

  private async cacheModel(manifest: ModelManifest, data: ArrayBuffer): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');

    await this.evictIfNeeded();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(MODEL_STORE, 'readwrite');
      const store = tx.objectStore(MODEL_STORE);

      const entry: CachedModel = {
        id: manifest.id,
        version: manifest.version,
        data,
        sha256: manifest.sha256,
        cachedAt: Date.now(),
        lastUsedAt: Date.now(),
        sizeBytes: data.byteLength,
        capabilities: manifest.capabilities,
        loadedInMemory: true,
      };

      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async getCachedModel(id: string): Promise<CachedModel | undefined> {
    if (!this.db) return undefined;
    return new Promise((resolve, reject) => {
      const store = this.db!.transaction(MODEL_STORE).objectStore(MODEL_STORE);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result ?? undefined);
      request.onerror = () => reject(request.error);
    });
  }

  private async getAllCachedModels(): Promise<CachedModel[]> {
    if (!this.db) return [];
    return new Promise((resolve, reject) => {
      const store = this.db!.transaction(MODEL_STORE).objectStore(MODEL_STORE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteCachedModel(id: string): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const store = this.db!.transaction(MODEL_STORE, 'readwrite').objectStore(MODEL_STORE);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async updateLastUsed(id: string): Promise<void> {
    const cached = await this.getCachedModel(id);
    if (!cached || !this.db) return;
    cached.lastUsedAt = Date.now();
    return new Promise((resolve, reject) => {
      const store = this.db!.transaction(MODEL_STORE, 'readwrite').objectStore(MODEL_STORE);
      const request = store.put(cached);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async loadIntoMemory(id: string, data: ArrayBuffer): Promise<void> {
    // Evict LRU models from memory if at capacity
    if (this.loadedModels.size >= this.config.maxModelsInMemory) {
      let oldestId: string | null = null;
      let oldestTime = Infinity;

      for (const [modelId] of this.loadedModels) {
        const cached = await this.getCachedModel(modelId);
        if (cached && cached.lastUsedAt < oldestTime) {
          oldestTime = cached.lastUsedAt;
          oldestId = modelId;
        }
      }

      if (oldestId) {
        this.loadedModels.delete(oldestId);
      }
    }

    this.loadedModels.set(id, data);
    await this.updateLastUsed(id);
  }

  close(): void {
    this.stopAutoUpdate();
    this.loadedModels.clear();
    this.db?.close();
    this.db = null;
  }
}
