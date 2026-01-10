import { Injectable, Logger } from '@nestjs/common';
import {
  GoogleDriveConfigDto,
  DriveFileMetadata,
  DriveFolderItem,
  SharedDriveInfo,
  FolderMode,
} from './dto';
import { GoogleOAuthService } from '../gmail-oauth/google-oauth.service';

/**
 * Google Drive API base URL
 */
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

/**
 * Google Workspace MIME types and their export formats
 */
export const GOOGLE_WORKSPACE_EXPORTS: Record<
  string,
  { mimeType: string; ext: string }
> = {
  'application/vnd.google-apps.document': {
    mimeType: 'text/markdown',
    ext: 'md',
  },
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'text/csv',
    ext: 'csv',
  },
  'application/vnd.google-apps.presentation': {
    mimeType: 'text/plain',
    ext: 'txt',
  },
};

/**
 * MIME types that can be processed as text
 */
const TEXT_MIME_TYPES = [
  'text/',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
];

/**
 * Default file filters
 */
const DEFAULT_EXCLUDED_MIME_TYPES = [
  'video/',
  'audio/',
  'application/vnd.google-apps.folder',
  'application/vnd.google-apps.shortcut',
  'application/vnd.google-apps.form',
  'application/vnd.google-apps.map',
  'application/vnd.google-apps.site',
];

/**
 * Simple rate limiter for API requests
 */
class RateLimiter {
  private lastRequestTime = 0;
  private readonly minInterval: number;

  constructor(requestsPerSecond: number) {
    this.minInterval = 1000 / requestsPerSecond;
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minInterval) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.minInterval - elapsed)
      );
    }
    this.lastRequestTime = Date.now();
  }
}

/**
 * Google Drive API Service
 *
 * Provides low-level access to Google Drive API v3.
 * Handles rate limiting, pagination, and file operations.
 */
@Injectable()
export class GoogleDriveApiService {
  private readonly logger = new Logger(GoogleDriveApiService.name);

  // Rate limiter: 8 requests per second
  private readonly rateLimiter = new RateLimiter(8);

  constructor(private readonly googleOAuthService: GoogleOAuthService) {}

  /**
   * Ensure valid access token and return headers
   */
  private async getAuthHeaders(
    config: GoogleDriveConfigDto
  ): Promise<{ headers: Record<string, string>; updatedToken?: string }> {
    const refreshed = await this.googleOAuthService.ensureValidToken({
      accessToken: config.accessToken,
      refreshToken: config.refreshToken,
      expiresAt: config.expiresAt,
    });

    const accessToken = refreshed?.accessToken || config.accessToken;

    return {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      updatedToken: refreshed?.accessToken,
    };
  }

  /**
   * Make a rate-limited API request
   */
  private async apiRequest<T>(
    config: GoogleDriveConfigDto,
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ data: T; updatedToken?: string }> {
    await this.rateLimiter.wait();

    const { headers, updatedToken } = await this.getAuthHeaders(config);

    const url = endpoint.startsWith('http')
      ? endpoint
      : `${DRIVE_API_BASE}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers as Record<string, string>),
      },
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Drive API error: ${response.status} - ${error}`);

      if (response.status === 429) {
        // Rate limited - throw specific error
        throw new Error('RATE_LIMITED: Too many requests to Google Drive');
      }

      throw new Error(`Google Drive API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as T;
    return { data, updatedToken };
  }

  /**
   * Get user information
   */
  async getUserInfo(
    config: GoogleDriveConfigDto
  ): Promise<{ email: string; displayName?: string }> {
    const { data } = await this.apiRequest<{
      user: { emailAddress: string; displayName?: string };
    }>(config, '/about?fields=user(emailAddress,displayName)');

    return {
      email: data.user.emailAddress,
      displayName: data.user.displayName,
    };
  }

  /**
   * List files in a folder or root
   */
  async listFiles(
    config: GoogleDriveConfigDto,
    options: {
      folderId?: string;
      driveId?: string;
      pageToken?: string;
      pageSize?: number;
      orderBy?: string;
      q?: string;
    } = {}
  ): Promise<{
    files: DriveFileMetadata[];
    nextPageToken?: string;
    updatedToken?: string;
  }> {
    const params = new URLSearchParams();

    // Fields to retrieve
    params.append(
      'fields',
      'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink,parents,driveId,trashed)'
    );

    // Page size
    params.append('pageSize', String(options.pageSize || 100));

    // Order by
    if (options.orderBy) {
      params.append('orderBy', options.orderBy);
    }

    // Build query
    const queryParts: string[] = ['trashed = false'];

    if (options.folderId) {
      queryParts.push(`'${options.folderId}' in parents`);
    }

    if (options.q) {
      queryParts.push(options.q);
    }

    params.append('q', queryParts.join(' and '));

    // Shared Drive support
    if (options.driveId) {
      params.append('driveId', options.driveId);
      params.append('corpora', 'drive');
    }
    params.append('includeItemsFromAllDrives', 'true');
    params.append('supportsAllDrives', 'true');

    // Pagination
    if (options.pageToken) {
      params.append('pageToken', options.pageToken);
    }

    const { data, updatedToken } = await this.apiRequest<{
      files: DriveFileMetadata[];
      nextPageToken?: string;
    }>(config, `/files?${params.toString()}`);

    return {
      files: data.files || [],
      nextPageToken: data.nextPageToken,
      updatedToken,
    };
  }

  /**
   * List all files with pagination (auto-paginate)
   */
  async listAllFiles(
    config: GoogleDriveConfigDto,
    options: {
      folderId?: string;
      driveId?: string;
      q?: string;
      maxFiles?: number;
    } = {}
  ): Promise<{ files: DriveFileMetadata[]; updatedToken?: string }> {
    const allFiles: DriveFileMetadata[] = [];
    let pageToken: string | undefined;
    let updatedToken: string | undefined;
    const maxFiles = options.maxFiles || 10000;

    do {
      const result = await this.listFiles(config, {
        folderId: options.folderId,
        driveId: options.driveId,
        q: options.q,
        pageToken,
        pageSize: Math.min(100, maxFiles - allFiles.length),
      });

      allFiles.push(...result.files);
      pageToken = result.nextPageToken;
      if (result.updatedToken) {
        updatedToken = result.updatedToken;
      }
    } while (pageToken && allFiles.length < maxFiles);

    return { files: allFiles, updatedToken };
  }

  /**
   * List all files recursively from a folder (includes all subfolders)
   * @param config - Drive configuration
   * @param options.folderId - Starting folder ID (default: 'root')
   * @param options.driveId - Shared Drive ID (for Shared Drives)
   * @param options.maxFiles - Maximum files to return
   * @param options.excludeFolderIds - Folder IDs to skip (and their children)
   */
  async listAllFilesRecursively(
    config: GoogleDriveConfigDto,
    options: {
      folderId?: string;
      driveId?: string;
      maxFiles?: number;
      excludeFolderIds?: Set<string>;
    } = {}
  ): Promise<{ files: DriveFileMetadata[] }> {
    const allFiles: DriveFileMetadata[] = [];
    const maxFiles = options.maxFiles || Infinity;
    const excludeSet = options.excludeFolderIds || new Set<string>();
    const foldersToProcess: string[] = [options.folderId || 'root'];
    const processedFolders = new Set<string>();

    while (foldersToProcess.length > 0 && allFiles.length < maxFiles) {
      const currentFolderId = foldersToProcess.shift()!;

      // Skip if already processed or explicitly excluded
      if (processedFolders.has(currentFolderId)) continue;
      if (excludeSet.has(currentFolderId)) continue;
      processedFolders.add(currentFolderId);

      try {
        const { files } = await this.listAllFiles(config, {
          folderId: currentFolderId,
          driveId: options.driveId,
          maxFiles: maxFiles - allFiles.length,
        });

        for (const file of files) {
          if (file.mimeType === 'application/vnd.google-apps.folder') {
            // Queue subfolder for processing (unless excluded)
            if (!excludeSet.has(file.id)) {
              foldersToProcess.push(file.id);
            }
          } else {
            allFiles.push(file);
            if (allFiles.length >= maxFiles) break;
          }
        }
      } catch (error) {
        this.logger.warn(
          `Failed to list files in folder ${currentFolderId}: ${error}`
        );
        // Continue with other folders
      }
    }

    return { files: allFiles };
  }

  /**
   * Count files recursively in a folder (for estimates)
   * Uses sampling for large folders to avoid excessive API calls
   */
  async countFilesRecursively(
    config: GoogleDriveConfigDto,
    options: {
      folderId: string;
      driveId?: string;
      maxDepth?: number;
      sampleSize?: number;
    }
  ): Promise<{ estimatedCount: number; isExact: boolean }> {
    const maxDepth = options.maxDepth ?? 10;
    const sampleSize = options.sampleSize ?? 500;
    let totalCount = 0;
    let isExact = true;

    const foldersToProcess: Array<{ id: string; depth: number }> = [
      { id: options.folderId, depth: 0 },
    ];
    const processedFolders = new Set<string>();

    while (foldersToProcess.length > 0 && totalCount < sampleSize) {
      const { id: currentFolderId, depth } = foldersToProcess.shift()!;

      if (processedFolders.has(currentFolderId)) continue;
      processedFolders.add(currentFolderId);

      try {
        const { files } = await this.listAllFiles(config, {
          folderId: currentFolderId,
          driveId: options.driveId,
          maxFiles: sampleSize - totalCount,
        });

        for (const file of files) {
          if (file.mimeType === 'application/vnd.google-apps.folder') {
            if (depth < maxDepth) {
              foldersToProcess.push({ id: file.id, depth: depth + 1 });
            } else {
              // Hit max depth, estimate is no longer exact
              isExact = false;
            }
          } else {
            totalCount++;
            if (totalCount >= sampleSize) {
              isExact = false;
              break;
            }
          }
        }
      } catch (error) {
        this.logger.warn(
          `Failed to count files in folder ${currentFolderId}: ${error}`
        );
      }
    }

    // If we stopped early due to sample size, extrapolate
    if (!isExact && foldersToProcess.length > 0) {
      // Rough estimate: multiply by remaining folder ratio
      const multiplier = 1 + foldersToProcess.length * 0.5;
      totalCount = Math.round(totalCount * multiplier);
    }

    return { estimatedCount: totalCount, isExact };
  }

  /**
   * Get file metadata
   */
  async getFile(
    config: GoogleDriveConfigDto,
    fileId: string
  ): Promise<DriveFileMetadata> {
    const params = new URLSearchParams();
    params.append(
      'fields',
      'id,name,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink,parents,driveId,trashed'
    );
    params.append('supportsAllDrives', 'true');

    const { data } = await this.apiRequest<DriveFileMetadata>(
      config,
      `/files/${fileId}?${params.toString()}`
    );

    return data;
  }

  /**
   * Download file content
   */
  async downloadFile(
    config: GoogleDriveConfigDto,
    fileId: string,
    mimeType: string
  ): Promise<{ content: string | Buffer; exportedMimeType?: string }> {
    await this.rateLimiter.wait();
    const { headers } = await this.getAuthHeaders(config);

    // Check if it's a Google Workspace file that needs export
    const exportFormat = GOOGLE_WORKSPACE_EXPORTS[mimeType];

    let url: string;
    let resultMimeType: string | undefined;

    if (exportFormat) {
      // Export Google Workspace file
      url = `${DRIVE_API_BASE}/files/${fileId}/export?mimeType=${encodeURIComponent(
        exportFormat.mimeType
      )}`;
      resultMimeType = exportFormat.mimeType;
    } else {
      // Download regular file
      url = `${DRIVE_API_BASE}/files/${fileId}?alt=media&supportsAllDrives=true`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to download file: ${error}`);
    }

    // Determine if content should be text or binary
    const contentType = response.headers.get('content-type') || mimeType;
    const isText =
      TEXT_MIME_TYPES.some((t) => contentType.startsWith(t)) ||
      resultMimeType?.startsWith('text/');

    if (isText) {
      return {
        content: await response.text(),
        exportedMimeType: resultMimeType,
      };
    } else {
      return {
        content: Buffer.from(await response.arrayBuffer()),
        exportedMimeType: resultMimeType,
      };
    }
  }

  /**
   * List Shared Drives (Team Drives)
   */
  async listSharedDrives(
    config: GoogleDriveConfigDto
  ): Promise<SharedDriveInfo[]> {
    const params = new URLSearchParams();
    params.append('fields', 'drives(id,name,colorRgb)');
    params.append('pageSize', '100');

    const { data } = await this.apiRequest<{ drives: SharedDriveInfo[] }>(
      config,
      `/drives?${params.toString()}`
    );

    return data.drives || [];
  }

  /**
   * Get start page token for changes API
   */
  async getStartPageToken(config: GoogleDriveConfigDto): Promise<string> {
    const params = new URLSearchParams();
    params.append('supportsAllDrives', 'true');

    const { data } = await this.apiRequest<{ startPageToken: string }>(
      config,
      `/changes/startPageToken?${params.toString()}`
    );

    return data.startPageToken;
  }

  /**
   * List changes since a page token
   */
  async listChanges(
    config: GoogleDriveConfigDto,
    pageToken: string
  ): Promise<{
    changes: Array<{
      fileId: string;
      removed: boolean;
      file?: DriveFileMetadata;
    }>;
    newStartPageToken?: string;
    nextPageToken?: string;
  }> {
    const params = new URLSearchParams();
    params.append('pageToken', pageToken);
    params.append(
      'fields',
      'nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink,parents,driveId,trashed))'
    );
    params.append('includeItemsFromAllDrives', 'true');
    params.append('supportsAllDrives', 'true');
    params.append('pageSize', '100');

    const { data } = await this.apiRequest<{
      changes: Array<{
        fileId: string;
        removed: boolean;
        file?: DriveFileMetadata;
      }>;
      newStartPageToken?: string;
      nextPageToken?: string;
    }>(config, `/changes?${params.toString()}`);

    return data;
  }

  /**
   * List all changes with pagination
   */
  async listAllChanges(
    config: GoogleDriveConfigDto,
    startToken: string
  ): Promise<{
    changes: Array<{
      fileId: string;
      removed: boolean;
      file?: DriveFileMetadata;
    }>;
    newStartPageToken: string;
  }> {
    const allChanges: Array<{
      fileId: string;
      removed: boolean;
      file?: DriveFileMetadata;
    }> = [];
    let pageToken = startToken;
    let newStartPageToken = startToken;

    do {
      const result = await this.listChanges(config, pageToken);
      allChanges.push(...(result.changes || []));

      if (result.newStartPageToken) {
        newStartPageToken = result.newStartPageToken;
        break;
      }

      if (result.nextPageToken) {
        pageToken = result.nextPageToken;
      } else {
        break;
      }
    } while (true);

    return { changes: allChanges, newStartPageToken };
  }

  /**
   * Get folder path by traversing parents
   */
  async getFolderPath(
    config: GoogleDriveConfigDto,
    fileId: string
  ): Promise<string> {
    const pathParts: string[] = [];
    let currentId = fileId;

    while (currentId) {
      try {
        const file = await this.getFile(config, currentId);
        if (file.name !== 'My Drive') {
          pathParts.unshift(file.name);
        }
        currentId = file.parents?.[0] || '';
      } catch {
        break;
      }
    }

    return pathParts.join('/') || '/';
  }

  /**
   * Check if a file should be processed based on filters
   */
  shouldProcessFile(
    file: DriveFileMetadata,
    config: GoogleDriveConfigDto
  ): boolean {
    // Skip folders
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      return false;
    }

    // Skip trashed files
    if (file.trashed) {
      return false;
    }

    // Check excluded MIME types
    const excludedTypes = [
      ...DEFAULT_EXCLUDED_MIME_TYPES,
      ...(config.fileFilters?.excludeMimeTypes || []),
    ];

    for (const excluded of excludedTypes) {
      if (excluded.endsWith('/')) {
        // Prefix match (e.g., 'video/')
        if (file.mimeType.startsWith(excluded)) {
          return false;
        }
      } else if (file.mimeType === excluded) {
        return false;
      }
    }

    // Check included MIME types (if specified)
    const includedTypes = config.fileFilters?.mimeTypes;
    if (includedTypes && includedTypes.length > 0) {
      let matches = false;
      for (const included of includedTypes) {
        if (included.endsWith('/') || included.endsWith('/*')) {
          const prefix = included.replace('/*', '/');
          if (file.mimeType.startsWith(prefix)) {
            matches = true;
            break;
          }
        } else if (file.mimeType === included) {
          matches = true;
          break;
        }
      }
      if (!matches) {
        return false;
      }
    }

    // Check file size
    const maxSizeMB = config.fileFilters?.maxFileSizeMB || 50;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    const fileSize = parseInt(file.size || '0', 10);
    if (fileSize > maxSizeBytes) {
      return false;
    }

    // Check if it's a supported Google Workspace type
    if (file.mimeType.startsWith('application/vnd.google-apps.')) {
      return !!GOOGLE_WORKSPACE_EXPORTS[file.mimeType];
    }

    return true;
  }

  /**
   * Check if file is in selected folders
   */
  isInSelectedFolders(
    file: DriveFileMetadata,
    config: GoogleDriveConfigDto
  ): boolean {
    // If mode is 'all', always return true
    if (!config.folderMode || config.folderMode === FolderMode.ALL) {
      return true;
    }

    // If mode is 'shared_drives', check driveId
    if (config.folderMode === FolderMode.SHARED_DRIVES) {
      const selectedDriveIds = (config.selectedSharedDrives || []).map(
        (d) => d.id
      );
      return file.driveId ? selectedDriveIds.includes(file.driveId) : false;
    }

    // If mode is 'specific', check if file's parent is in selected folders
    if (config.folderMode === FolderMode.SPECIFIC) {
      const selectedFolderIds = (config.selectedFolders || []).map((f) => f.id);

      // Check immediate parent
      if (file.parents?.some((p) => selectedFolderIds.includes(p))) {
        return true;
      }

      // For nested files, we'd need to traverse up - for now, just check immediate parent
      // This is a simplification; full implementation would cache folder structure
      return false;
    }

    return true;
  }

  /**
   * Build browse result with folder items
   */
  async browseFolders(
    config: GoogleDriveConfigDto,
    options: {
      folderId?: string;
      driveId?: string;
      pageToken?: string;
      pageSize?: number;
    } = {}
  ): Promise<{
    items: DriveFolderItem[];
    nextPageToken?: string;
    sharedDrives?: SharedDriveInfo[];
  }> {
    const items: DriveFolderItem[] = [];

    // If browsing root and no specific drive, also list Shared Drives
    let sharedDrives: SharedDriveInfo[] | undefined;
    if (!options.folderId && !options.driveId) {
      try {
        sharedDrives = await this.listSharedDrives(config);
      } catch (e) {
        this.logger.warn(`Failed to list Shared Drives: ${e}`);
      }
    }

    // List files and folders
    const result = await this.listFiles(config, {
      folderId: options.folderId || 'root',
      driveId: options.driveId,
      pageToken: options.pageToken,
      pageSize: options.pageSize || 50,
      orderBy: 'folder,name',
    });

    for (const file of result.files) {
      const isFolder = file.mimeType === 'application/vnd.google-apps.folder';

      items.push({
        id: file.id,
        name: file.name,
        path: file.name, // Would need to build full path if needed
        isFolder,
        mimeType: file.mimeType,
        size: file.size ? parseInt(file.size, 10) : undefined,
        modifiedTime: file.modifiedTime,
        webViewLink: file.webViewLink,
      });
    }

    return {
      items,
      nextPageToken: result.nextPageToken,
      sharedDrives,
    };
  }
}
