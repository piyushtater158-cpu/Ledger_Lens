'use client';
import { useState, useCallback } from 'react';
import type { UploadedFile, ColumnMapping, InvoiceRow, Toast } from '@/lib/types';
import { parseUploadedFile, autoDetectColumns } from '@/lib/excel';
import { fileNameFromLink } from '@/lib/drive';

export function useFileUpload(toast: (text: string, kind?: Toast['kind']) => void) {
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({ driveLink: '', payee: '', acct: '', ifsc: '', amount: '' });
  const [parsingFile, setParsingFile] = useState(false);

  const handleFile = useCallback(async (file: File): Promise<boolean> => {
    setParsingFile(true);
    try {
      const { headers, rawData } = await parseUploadedFile(file);
      if (rawData.length === 0) { toast('File is empty', 'error'); return false; }
      const detected = autoDetectColumns(headers);
      setUploadedFile({ name: file.name, rowCount: rawData.length, headers, rawData, file });
      setMapping({ driveLink: '', payee: '', acct: '', ifsc: '', amount: '', ...detected });
      return true;
    } catch {
      toast('Could not parse file — make sure it is a valid .xlsx or .csv', 'error');
      return false;
    } finally {
      setParsingFile(false);
    }
  }, [toast]);

  const buildRows = useCallback((): InvoiceRow[] => {
    if (!uploadedFile || !mapping.driveLink) return [];
    return uploadedFile.rawData.map((raw, i) => ({
      id: String(i),
      index: i,
      fileName: fileNameFromLink(String(raw[mapping.driveLink] ?? '')) || `Row ${i + 1}`,
      driveLink: String(raw[mapping.driveLink] ?? ''),
      payee: mapping.payee ? String(raw[mapping.payee] ?? '') : '',
      acct: mapping.acct ? String(raw[mapping.acct] ?? '') : '',
      ifsc: mapping.ifsc ? String(raw[mapping.ifsc] ?? '') : '',
      amount: mapping.amount ? String(raw[mapping.amount] ?? '') : '',
      currency: '',
      status: 'pending',
      source: 'sheet',
    }));
  }, [uploadedFile, mapping]);

  const reset = useCallback(() => {
    setUploadedFile(null);
    setMapping({ driveLink: '', payee: '', acct: '', ifsc: '', amount: '' });
  }, []);

  return { uploadedFile, mapping, setMapping, parsingFile, handleFile, buildRows, reset };
}
