"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { SpinnerIcon } from "@/components/ui/icons";
import { FORM_INPUT_CLS, FORM_LABEL_CLS } from "@/lib/constants";
import type { Department, CreateDepartmentRequest } from "@/lib/api";

export function CreateDepartmentModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: CreateDepartmentRequest) => Promise<Department>;
}) {
  const [name, setName]             = useState("");
  const [description, setDesc]      = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({ name: name.trim(), description: description.trim() || undefined });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create department.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Create Department" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className={FORM_LABEL_CLS}>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            required placeholder="e.g. Water Supply" className={FORM_INPUT_CLS} />
        </div>

        <div>
          <label className={FORM_LABEL_CLS}>
            Description{" "}
            <span className="normal-case font-normal">(optional)</span>
          </label>
          <input type="text" value={description} onChange={(e) => setDesc(e.target.value)}
            placeholder="Brief description" className={FORM_INPUT_CLS} />
        </div>

        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            className="flex-1 px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center justify-center gap-2">
            {submitting && <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />}
            Create
          </button>
        </div>
      </form>
    </Modal>
  );
}
