'use client';
import { useState, useCallback } from 'react';
import type { InvoiceRow, ColumnMapping, Toast, UploadedFile, RowStatus } from '@/lib/types';
import { parseN8nResultBlob, buildDownloadBlob } from '@/lib/excel';
import { extractFile, extractRow } from '@/lib/api';
import { normalizeRowStatus, rowStatusErrorMessage } from '@/lib/rowStatus';

export function useInvoiceExtraction(
  uploadedFile: UploadedFile | null,
  mapping: ColumnMapping,
  toast: (text: string, kind?: Toast['kind']) => void,
) {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState<{ rowId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const runAll = useCallback(async () => {
    if (!uploadedFile || running) return;
    setRunning(true);
    setRows((prev) =>
      prev.map((r) =>
        r.status === 'pending' || r.status === 'error' ? { ...r, status: 'processing' } : r
      )
    );

    try {
      const blob = await extractFile(uploadedFile.file);
      const results = await parseN8nResultBlob(blob, mapping);
      setRows((prev) =>
        prev.map((r, i) => {
          const result = results[i];
          if (!result) return r;
          return {
            ...r,
            payee: result.payee || r.payee,
            acct: result.acct || r.acct,
            ifsc: result.ifsc || r.ifsc,
            amount: result.amount || r.amount,
            status: result.status,
            error: result.error,
            confidence: result.confidence,
          };
        })
      );
      const done = results.filter((r) => r.status === 'done').length;
      toast(`Extraction complete — ${done} of ${results.length} done`, 'success');
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      if (err.status === 401) {
        toast('Session expired — please sign in again', 'error');
        setRows((prev) =>
          prev.map((r) =>
            r.status === 'processing'
              ? { ...r, status: 'error', error: 'Auth expired', errorType: 'auth' }
              : r
          )
        );
      } else {
        toast(`Extraction failed: ${err.message ?? 'Unknown error'}`, 'error');
        setRows((prev) =>
          prev.map((r) =>
            r.status === 'processing' ? { ...r, status: 'error', error: err.message } : r
          )
        );
      }
    } finally {
      setRunning(false);
    }
  }, [uploadedFile, running, mapping, toast]);

  const rerun = useCallback(async (rowId: string) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    setRows((prev) => prev.map((r) => r.id === rowId ? { ...r, status: 'processing' } : r));

    try {
      const data = await extractRow(row.driveLink);
      // #region agent log
      fetch('http://127.0.0.1:7278/ingest/2c22404a-379e-4acd-837f-babf35680249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bc92db'},body:JSON.stringify({sessionId:'bc92db',location:'useInvoiceExtraction.ts:rerun',message:'extract-row response',data:{rawStatus:data.status,normalized:normalizeRowStatus(data.status),hasPayee:!!data.payee},timestamp:Date.now(),hypothesisId:'E',runId:'pre-fix'})}).catch(()=>{});
      // #endregion
      const status = normalizeRowStatus(data.status);
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                payee: data.payee ?? r.payee,
                acct: data.accountNumber ?? r.acct,
                ifsc: data.ifsc ?? r.ifsc,
                amount: data.amount ?? r.amount,
                status,
                error: rowStatusErrorMessage(data.status),
                confidence: data.confidence,
              }
            : r
        )
      );
      toast('Row re-extracted successfully', 'success');
    } catch (e: unknown) {
      const err = e as { message?: string };
      setRows((prev) =>
        prev.map((r) => r.id === rowId ? { ...r, status: 'error', error: err.message ?? 'Network error' } : r)
      );
      toast(`Re-run failed: ${err.message ?? 'Network error'}`, 'error');
    }
  }, [rows, toast]);

  const startEdit = useCallback((rowId: string, field: string, current: string) => {
    setEditing({ rowId, field });
    setEditValue(current);
  }, []);

  const commitEdit = useCallback(() => {
    if (!editing) return;
    setRows((prev) =>
      prev.map((r) => r.id === editing.rowId ? { ...r, [editing.field]: editValue } : r)
    );
    setEditing(null);
  }, [editing, editValue]);

  const download = useCallback(async () => {
    if (!uploadedFile) return;
    try {
      const blob = await buildDownloadBlob(uploadedFile.rawData, rows, mapping, uploadedFile.headers);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = uploadedFile.name.replace(/\.(xlsx|xls|csv)$/i, '') + '-filled.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      toast('File downloaded', 'success');
    } catch {
      toast('Download failed', 'error');
    }
  }, [uploadedFile, rows, mapping, toast]);

  // Derived stats
  const total = rows.length;
  const done = rows.filter((r) => r.status === 'done').length;
  const errCount = rows.filter((r) => r.status === 'error').length;
  const unsupported = rows.filter((r) => r.status === 'unsupported').length;
  const processing = rows.filter((r) => r.status === 'processing').length;
  const pending = rows.filter((r) => r.status === 'pending').length;
  const hasAuth = rows.some((r) => r.status === 'error' && r.errorType === 'auth');
  const allDone = !running && pending === 0 && processing === 0 && errCount === 0 && done > 0;
  const allFailed = !running && pending === 0 && processing === 0 && errCount > 0 && done === 0;
  const progress = total > 0 ? (done / total) * 100 : 0;

  return {
    rows, setRows, running,
    editing, setEditing, editValue, setEditValue,
    runAll, rerun, startEdit, commitEdit, download,
    total, done, errCount, unsupported, processing, pending,
    hasAuth, allDone, allFailed, progress,
  };
}
