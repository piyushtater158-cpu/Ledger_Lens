'use client';
import { useState, useCallback, useRef } from 'react';
import type { InvoiceRow, ColumnMapping, Toast, UploadedFile, RowStatus } from '@/lib/types';
import { parseN8nResultBlob, buildDownloadBlob, buildGmailDownloadBlob } from '@/lib/excel';
import { extractFile, extractRow, discoverGmail, extractGmailAttachment } from '@/lib/api';
import type { GmailDiscoverParams } from '@/lib/api';
import { normalizeRowStatus, rowStatusErrorMessage } from '@/lib/rowStatus';

export function useInvoiceExtraction(
  uploadedFile: UploadedFile | null,
  mapping: ColumnMapping,
  toast: (text: string, kind?: Toast['kind']) => void,
) {
  const [rows, setRowsState] = useState<InvoiceRow[]>([]);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState<{ rowId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const rowsRef = useRef<InvoiceRow[]>([]);

  const setRows = useCallback((updater: InvoiceRow[] | ((prev: InvoiceRow[]) => InvoiceRow[])) => {
    setRowsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      rowsRef.current = next;
      return next;
    });
  }, []);

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
            currency: result.currency || r.currency,
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
  }, [uploadedFile, running, mapping, toast, setRows]);

  const runGmail = useCallback(async (params: GmailDiscoverParams) => {
    if (running) return;
    setRunning(true);

    try {
      const { invoices, truncated, scanned } = await discoverGmail(params);

      if (!invoices.length) {
        toast(`No invoice attachments found in ${scanned} emails scanned`, 'info');
        setRunning(false);
        return;
      }

      if (truncated) {
        toast('Showing first 200 attachments — narrow the date range or keywords to see all', 'info');
      }

      const pendingRows: InvoiceRow[] = invoices.map((inv, i) => ({
        id: inv.id,
        index: i,
        fileName: inv.filename,
        driveLink: '',
        payee: '', acct: '', ifsc: '', amount: '', currency: '',
        status: 'pending',
        source: 'gmail',
        sender: inv.sender,
        subject: inv.subject,
        emailDate: inv.emailDate,
        attachmentName: inv.filename,
        messageId: inv.messageId,
        attachmentId: inv.attachmentId,
        mimeType: inv.mimeType,
      }));
      setRows(pendingRows);

      const CONCURRENCY = 4;
      let doneCount = 0;
      let skippedCount = 0;

      const processOne = async (row: InvoiceRow) => {
        setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, status: 'processing' } : r));
        try {
          const data = await extractGmailAttachment({
            messageId: row.messageId!,
            attachmentId: row.attachmentId!,
            mimeType: row.mimeType ?? 'application/pdf',
            filename: row.fileName,
          });
          const status = normalizeRowStatus(data.status);
          if (status === 'done') doneCount++;
          if (status === 'skipped') skippedCount++;
          setRows((prev) =>
            prev.map((r) =>
              r.id === row.id
                ? {
                    ...r,
                    payee: data.payee ?? r.payee,
                    acct: data.accountNumber ?? r.acct,
                    ifsc: data.ifsc ?? r.ifsc,
                    amount: data.amount ?? r.amount,
                    currency: data.currency ?? r.currency,
                    status,
                    error: rowStatusErrorMessage(data.status),
                    confidence: data.confidence,
                  }
                : r
            )
          );
        } catch (e: unknown) {
          const err = e as { message?: string };
          setRows((prev) =>
            prev.map((r) => r.id === row.id ? { ...r, status: 'error', error: err.message ?? 'Network error' } : r)
          );
        }
      };

      let i = 0;
      const runPool = async () => {
        while (i < pendingRows.length) {
          const batch = pendingRows.slice(i, i + CONCURRENCY);
          i += CONCURRENCY;
          await Promise.all(batch.map(processOne));
        }
      };
      await runPool();

      toast(
        `Extraction complete — ${doneCount} payment invoices found, ${skippedCount} skipped as non-invoices`,
        doneCount > 0 ? 'success' : 'info'
      );
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      if (err.status === 401) {
        toast('Session expired — please sign in again', 'error');
      } else if (err.status === 403) {
        toast(
          err.message ??
            'Gmail permission denied — sign out and sign in again to grant Gmail read access',
          'error'
        );
      } else {
        toast(`Gmail scan failed: ${err.message ?? 'Unknown error'}`, 'error');
      }
    } finally {
      setRunning(false);
    }
  }, [running, toast, setRows]);

  const rerun = useCallback(async (rowId: string) => {
    const row = rowsRef.current.find((r) => r.id === rowId);
    if (!row) return;
    setRows((prev) => prev.map((r) => r.id === rowId ? { ...r, status: 'processing' } : r));

    if (row.source === 'gmail') {
      try {
        const data = await extractGmailAttachment({
          messageId: row.messageId!,
          attachmentId: row.attachmentId!,
          mimeType: row.mimeType ?? 'application/pdf',
          filename: row.fileName,
        });
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
                  currency: data.currency ?? r.currency,
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
      return;
    }

    try {
      const data = await extractRow(row.driveLink);
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
                currency: data.currency ?? r.currency,
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
  }, [toast, setRows]);

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
  }, [editing, editValue, setRows]);

  const download = useCallback(async () => {
    const currentRows = rowsRef.current;
    const isGmail = currentRows.some((r) => r.source === 'gmail');

    try {
      if (isGmail) {
        const blob = await buildGmailDownloadBlob(currentRows);
        const dateTag = new Date().toISOString().slice(0, 10);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gmail-invoices-${dateTag}-filled.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        toast('File downloaded', 'success');
      } else {
        if (!uploadedFile) return;
        const blob = await buildDownloadBlob(uploadedFile.rawData, currentRows, mapping, uploadedFile.headers);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = uploadedFile.name.replace(/\.(xlsx|xls|csv)$/i, '') + '-filled.xlsx';
        a.click();
        URL.revokeObjectURL(url);
        toast('File downloaded', 'success');
      }
    } catch {
      toast('Download failed', 'error');
    }
  }, [uploadedFile, mapping, toast]);

  const total = rows.length;
  const done = rows.filter((r) => r.status === 'done').length;
  const errCount = rows.filter((r) => r.status === 'error').length;
  const unsupported = rows.filter((r) => r.status === 'unsupported').length;
  const skipped = rows.filter((r) => r.status === 'skipped').length;
  const processing = rows.filter((r) => r.status === 'processing').length;
  const pending = rows.filter((r) => r.status === 'pending').length;
  const hasAuth = rows.some((r) => r.status === 'error' && r.errorType === 'auth');
  const allDone = !running && pending === 0 && processing === 0 && errCount === 0 && done > 0;
  const allFailed = !running && pending === 0 && processing === 0 && errCount > 0 && done === 0;
  const progress = total > 0 ? (done / total) * 100 : 0;

  return {
    rows, setRows, running,
    editing, setEditing, editValue, setEditValue,
    runAll, runGmail, rerun, startEdit, commitEdit, download,
    total, done, errCount, unsupported, skipped, processing, pending,
    hasAuth, allDone, allFailed, progress,
  };
}
