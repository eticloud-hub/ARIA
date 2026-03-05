import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, FolderPlus } from 'lucide-react';
import api from '../lib/api';
import { useUiStore } from '../stores/uiStore';

/**
 * CaseCreateScreen — S-04
 * Case creation wizard: metadata entry, artifact upload, confirmation.
 */
export const CaseCreateScreen: React.FC = () => {
    const navigate = useNavigate();
    const { addToast } = useUiStore();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const { data } = await api.post('/cases', { title, description: description || undefined });
            addToast({
                type: 'success',
                title: 'Case Created',
                message: `Case ${data.data.reference_id} created successfully.`,
            });
            navigate(`/cases/${data.data.id}`);
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
            addToast({
                type: 'error',
                title: 'Error',
                message: axiosErr.response?.data?.error?.message || 'Failed to create case.',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl animate-fade-in">
            <button
                onClick={() => navigate(-1)}
                className="aria-btn-ghost mb-4"
            >
                <ArrowLeft className="w-4 h-4" />
                Back
            </button>

            <div className="aria-card p-8">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-navy-50 flex items-center justify-center">
                        <FolderPlus className="w-5 h-5 text-navy-600" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">Create New Case</h1>
                        <p className="text-sm text-slate-500">Begin a new forensic behavioral analysis</p>
                    </div>
                </div>

                <form onSubmit={handleCreate} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Case Title <span className="text-red-500">*</span>
                        </label>
                        <input
                            id="case-title"
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="aria-input"
                            placeholder="e.g., Data exfiltration investigation — Q1 2026"
                            required
                            maxLength={200}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Description
                        </label>
                        <textarea
                            id="case-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="aria-input min-h-[100px] resize-y"
                            placeholder="Brief description of the investigation scope and context..."
                            maxLength={2000}
                        />
                    </div>

                    <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                        <button
                            id="create-case-submit"
                            type="submit"
                            disabled={loading || !title}
                            className="aria-btn-primary"
                        >
                            {loading ? 'Creating...' : 'Create Case'}
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate(-1)}
                            className="aria-btn-secondary"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
