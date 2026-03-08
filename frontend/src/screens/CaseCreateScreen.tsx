import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, FolderPlus, AlertCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../lib/api';
import { useUiStore } from '../stores/uiStore';

// Mirroring the backend src/modules/cases/cases.schemas.ts validation
const createCaseSchema = z.object({
    title: z.string().min(1, 'Title is required').max(200, 'Title cannot exceed 200 characters'),
    description: z.string().max(2000, 'Description cannot exceed 2000 characters').optional(),
});

type CreateCaseFormValues = z.infer<typeof createCaseSchema>;

/**
 * CaseCreateScreen — S-04
 * Case creation wizard: metadata entry, artifact upload, confirmation.
 */
export const CaseCreateScreen: React.FC = () => {
    const navigate = useNavigate();
    const { addToast } = useUiStore();
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<CreateCaseFormValues>({
        resolver: zodResolver(createCaseSchema),
        defaultValues: { title: '', description: '' },
    });

    const onSubmit = async (values: CreateCaseFormValues) => {
        try {
            const { data } = await api.post('/cases', values);
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

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Case Title <span className="text-red-500">*</span>
                        </label>
                        <input
                            id="case-title"
                            type="text"
                            {...register('title')}
                            className={`aria-input ${errors.title ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                            placeholder="e.g., Data exfiltration investigation — Q1 2026"
                        />
                        {errors.title && (
                            <p className="mt-1 flex items-center gap-1 text-sm text-red-600">
                                <AlertCircle className="w-3.5 h-3.5" />
                                {errors.title.message}
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Description
                        </label>
                        <textarea
                            id="case-description"
                            {...register('description')}
                            className={`aria-input min-h-[100px] resize-y ${errors.description ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                            placeholder="Brief description of the investigation scope and context..."
                        />
                        {errors.description && (
                            <p className="mt-1 flex items-center gap-1 text-sm text-red-600">
                                <AlertCircle className="w-3.5 h-3.5" />
                                {errors.description.message}
                            </p>
                        )}
                    </div>

                    <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                        <button
                            id="create-case-submit"
                            type="submit"
                            disabled={isSubmitting}
                            className="aria-btn-primary"
                        >
                            {isSubmitting ? 'Creating...' : 'Create Case'}
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
