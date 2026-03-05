/**
 * Port: Artifact Storage
 * Anti-corruption layer per TRD §03 — abstracts S3/MinIO behind a stable interface.
 * Swap implementations by changing the adapter binding.
 */
export interface UploadUrlResult {
    url: string;
    key: string;
    expiresAt: Date;
}

export interface StoragePort {
    /** Generate a pre-signed URL for client-side upload */
    generateUploadUrl(
        bucket: string,
        key: string,
        contentType: string,
        expiresInSeconds: number
    ): Promise<UploadUrlResult>;

    /** Generate a pre-signed URL for download */
    generateDownloadUrl(
        bucket: string,
        key: string,
        expiresInSeconds: number
    ): Promise<string>;

    /** Check if an object exists */
    objectExists(bucket: string, key: string): Promise<boolean>;

    /** Get object metadata (size, hash, etc.) */
    getObjectMetadata(bucket: string, key: string): Promise<{
        contentLength: number;
        contentType: string;
        eTag: string;
    }>;

    /** Delete an object */
    deleteObject(bucket: string, key: string): Promise<void>;
}
