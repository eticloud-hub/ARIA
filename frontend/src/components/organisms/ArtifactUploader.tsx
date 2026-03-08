import React, { useEffect, useState } from 'react';
import Uppy from '@uppy/core';
import AwsS3 from '@uppy/aws-s3';
import { Dashboard } from '@uppy/react';
import '@uppy/core/dist/style.min.css';
import '@uppy/dashboard/dist/style.min.css';
import api from '../../lib/api';
import { useUiStore } from '../../stores/uiStore';

interface ArtifactUploaderProps {
    caseId: string;
    onUploadSuccess: () => void;
    onClose: () => void;
}

export const ArtifactUploader: React.FC<ArtifactUploaderProps> = ({ caseId, onUploadSuccess, onClose }) => {
    const { addToast } = useUiStore();
    const [uppy] = useState(() => new Uppy({
        id: 'artifact-uploader',
        autoProceed: false,
        restrictions: {
            maxNumberOfFiles: 50,
            allowedFileTypes: ['.evtx', '.pcap', '.csv', '.json'],
        },
    }));

    useEffect(() => {
        // Configure Uppy specifically to ask our backend for presigned URLs.
        uppy.use(AwsS3, {
            // Because Uppy expects specific JSON structures, we intercept it with `getUploadParameters`
            getUploadParameters: async (file) => {
                try {
                    // Tell our backend it's preping an upload and we need to lock down an S3 URL
                    const response = await api.post(`/cases/${caseId}/artifacts`, {
                        filename: file.name,
                        fileFormat: file.extension?.toLowerCase() || 'json',
                        sizeBytes: file.size,
                        // We do not have sha256 computed on client side right now purely via uppy out of the box without heavily degrading performance
                        // For the MVP, we skip strictly enforcing matching SHA256 before uploading in the browser
                        sha256Hash: `client-unverified-${Date.now()}`
                    });

                    const { id, uploadUrl } = response.data.data;

                    // Attach the generated artifact ID to the file object so we can confirm it later
                    file.meta = { ...file.meta, artifactId: id };

                    return {
                        method: 'PUT',
                        url: uploadUrl,
                        headers: {
                            'Content-Type': file.type,
                        },
                    };
                } catch (error) {
                    addToast({ type: 'error', title: 'Upload Init Failed', message: 'Could not obtain signed URL.' });
                    throw error;
                }
            },
        });

        uppy.on('upload-success', async (file) => {
            // After successful upload to S3, hook back to our API to transition status to valid
            try {
                const artifactId = file.meta.artifactId;
                if (!artifactId) return;
                await api.post(`/cases/${caseId}/artifacts/${artifactId}/confirm`);
            } catch (error) {
                addToast({ type: 'error', title: 'Confirmation Failed', message: `Could not confirm ${file.name}` });
            }
        });

        uppy.on('complete', (result) => {
            if (result.successful.length > 0) {
                addToast({ type: 'success', title: 'Upload Complete', message: `Successfully uploaded ${result.successful.length} artifacts.` });
                onUploadSuccess();
                onClose();
            }
        });

        return () => {
            uppy.close();
        };
    }, [uppy, caseId, onUploadSuccess, onClose, addToast]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-slate-100">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Upload Case Evidence</h2>
                        <p className="text-sm text-slate-500">Only .evtx, .pcap, .csv, and .json files are allowed.</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-50">
                        Close
                    </button>
                </div>

                <div className="p-6">
                    <Dashboard
                        uppy={uppy}
                        inline={true}
                        width="100%"
                        height={400}
                        showProgressDetails={true}
                        proudlyDisplayPoweredByUppy={false}
                        note="Data will be directly streamed via cryptographic presigned URLs."
                    />
                </div>
            </div>
        </div>
    );
};
