import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getConfig } from '../config';
import type { StoragePort, UploadUrlResult } from '../ports/storage.port';

export class S3StorageAdapter implements StoragePort {
    private client: S3Client;

    constructor() {
        const config = getConfig();
        this.client = new S3Client({
            endpoint: config.S3_ENDPOINT,
            region: config.S3_REGION,
            credentials: {
                accessKeyId: config.S3_ACCESS_KEY,
                secretAccessKey: config.S3_SECRET_KEY,
            },
            forcePathStyle: true, // Required for MinIO local dev
        });
    }

    async generateUploadUrl(
        bucket: string,
        key: string,
        contentType: string,
        expiresInSeconds: number
    ): Promise<UploadUrlResult> {
        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: contentType,
        });

        const url = await getSignedUrl(this.client, command, {
            expiresIn: expiresInSeconds,
        });

        return {
            url,
            key,
            expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
        };
    }

    async generateDownloadUrl(
        bucket: string,
        key: string,
        expiresInSeconds: number
    ): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        });

        return getSignedUrl(this.client, command, {
            expiresIn: expiresInSeconds,
        });
    }

    async objectExists(bucket: string, key: string): Promise<boolean> {
        try {
            await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
            return true;
        } catch {
            return false;
        }
    }

    async getObjectMetadata(bucket: string, key: string): Promise<{
        contentLength: number;
        contentType: string;
        eTag: string;
    }> {
        const result = await this.client.send(
            new HeadObjectCommand({ Bucket: bucket, Key: key })
        );
        return {
            contentLength: result.ContentLength || 0,
            contentType: result.ContentType || 'application/octet-stream',
            eTag: result.ETag || '',
        };
    }

    async deleteObject(bucket: string, key: string): Promise<void> {
        await this.client.send(
            new DeleteObjectCommand({ Bucket: bucket, Key: key })
        );
    }
}
