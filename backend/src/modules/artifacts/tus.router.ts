import express, { Router, Request, Response } from 'express';
import { Server, EVENTS } from '@tus/server';
import { S3Store } from '@tus/s3-store';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import type { Container } from '../../container';
import { logger } from '../../utils/logger';
import { getConfig } from '../../config';

export function createTusRouter(container: Container): Router {
    const router = Router();
    const config = getConfig();
    const { artifactRepository } = container;

    const s3Client = new S3Client({
        region: config.S3_REGION,
        credentials: {
            accessKeyId: config.S3_ACCESS_KEY,
            secretAccessKey: config.S3_SECRET_KEY,
        },
        endpoint: config.S3_ENDPOINT || undefined,
        forcePathStyle: true,
    });

    const tusServer = new Server({
        path: '/api/v1/tus',
        datastore: new S3Store({
            s3ClientConfig: {
                region: config.S3_REGION,
                credentials: {
                    accessKeyId: config.S3_ACCESS_KEY,
                    secretAccessKey: config.S3_SECRET_KEY,
                },
                endpoint: config.S3_ENDPOINT || undefined,
                forcePathStyle: true,
                bucket: config.S3_ARTIFACTS_BUCKET,
            },
            partSize: 5 * 1024 * 1024,
        }),
        namingFunction(req) {
            // Generate a random ID for the S3 key
            return `upload-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        },
        async onUploadCreate(req, upload) {
            // Strict server-side validation for maximum file sizes (10GB) and formats
            const size = upload.size ? Number(upload.size) : 0;
            if (size > 10 * 1024 * 1024 * 1024) {
                throw { status_code: 413, body: 'File size exceeds 10GB limit' };
            }

            const format = upload.metadata?.file_format;
            if (!['evtx', 'pcap', 'csv', 'json'].includes(format || '')) {
                throw { status_code: 415, body: 'Unsupported file format' };
            }

            logger.info({ metadata: upload.metadata, size: upload.size }, 'Tus upload initiated and passed boundary checks');
            return {};
        },
        async onUploadFinish(req, upload) {
            logger.info({ id: upload.id }, 'Tus upload finished to S3. Calculating SHA256 safely.');

            try {
                // TRD Requires true Server-Side Hash Calculation.
                // Because Tus allows out-of-order and resumed chunks, a continuous "on the fly" SHA256 
                // during the initial ingest is risky without persisting crypto states. 
                // Instead, we immediately stream the fully assembled S3 object back through a pipe 
                // to calculate the immutable SHA256 without buffering to disk.
                const getObj = new GetObjectCommand({
                    Bucket: config.S3_ARTIFACTS_BUCKET,
                    Key: upload.id,
                });

                const s3Res = await s3Client.send(getObj);

                if (!s3Res.Body) {
                    throw new Error('S3 Body is empty');
                }

                const hash = createHash('sha256');

                // Read the Node.js Readable stream from AWS SDK v3
                const stream = s3Res.Body as any; // Cast to bypass types, AWS SDK exposes standard stream here in Node

                stream.on('data', (chunk: Buffer) => hash.update(chunk));

                await new Promise<void>((resolve, reject) => {
                    stream.on('end', resolve);
                    stream.on('error', reject);
                });

                const finalHash = hash.digest('hex');
                logger.info({ id: upload.id, sha256: finalHash }, 'Server-Side SHA256 computed streamside');

                // If the frontend passed metadata with the case_id, we can link it
                const caseId = upload.metadata?.case_id;
                const orgId = upload.metadata?.org_id;
                const userId = upload.metadata?.user_id;
                const filename = upload.metadata?.filename || upload.id;
                const format = upload.metadata?.file_format || 'evtx';

                if (caseId && orgId && userId) {
                    await artifactRepository.create(
                        upload.id, // Artifact ID matches S3 key
                        caseId,
                        orgId,
                        filename,
                        upload.id, // S3 Key
                        format as any,
                        upload.size ? Number(upload.size) : 0,
                        finalHash,
                        userId
                    );
                    logger.info('Artifact formally recorded in DB via Tus integration.');
                }
            } catch (error) {
                logger.error({ err: error, id: upload.id }, 'Failed to compute final SHA256 hash or link artifact');
            }

            return {};
        }
    });

    // Express middleware to mount the tus server
    router.use('/', (req, res, next) => {
        // Authenticate the user manually here since Tus server consumes the request
        // Ensure authentication happens before delegating to tusServer
        container.authMiddleware.authenticate(req, res, (err) => {
            if (err) return next(err);
            tusServer.handle(req, res);
        });
    });

    return router;
}
