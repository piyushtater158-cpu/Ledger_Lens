'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { C } from '@/lib/colors';
import type { Screen } from '@/lib/types';
import ToastStack from '@/components/ToastStack';
import { useToasts } from '@/hooks/useToasts';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useInvoiceExtraction } from '@/hooks/useInvoiceExtraction';
import TopNav from '@/components/dashboard/TopNav';
import UploadScreen from '@/screens/UploadScreen';
import MappingScreen from '@/screens/MappingScreen';
import DashboardScreen from '@/screens/DashboardScreen';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('upload');

  const { toasts, toast } = useToasts();
  const { uploadedFile, mapping, setMapping, parsingFile, handleFile, buildRows, reset } = useFileUpload(toast);
  const extraction = useInvoiceExtraction(uploadedFile, mapping, toast);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/config/status')
      .then((r) => r.json())
      .then((data: { n8nReady?: boolean; message?: string }) => {
        if (!data.n8nReady && data.message) toast(data.message, 'error');
      })
      .catch(() => {});
  }, [status, toast]);

  const onFile = async (file: File) => {
    const ok = await handleFile(file);
    if (ok) setScreen('mapping');
  };

  const onConfirmMapping = () => {
    const rows = buildRows();
    if (!rows.length) return;
    extraction.setRows(rows);
    setScreen('dashboard');
  };

  const onNewFile = () => {
    reset();
    extraction.setRows([]);
    setScreen('upload');
  };

  const userName = session?.user?.name ?? '';
  const userInitials = userName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  if (status === 'loading') {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div className="spin" style={{ width: 28, height: 28, border: `3px solid ${C.line}`, borderTopColor: C.blue, borderRadius: '50%' }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column' }}>
      <TopNav session={session} screen={screen} userName={userName} userInitials={userInitials} />

      <main style={{ flex: 1, padding: '40px 32px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        {screen === 'upload' && (
          <UploadScreen onFile={onFile} loading={parsingFile} />
        )}
        {screen === 'mapping' && uploadedFile && (
          <MappingScreen
            uploadedFile={uploadedFile}
            mapping={mapping}
            onMappingChange={setMapping}
            onConfirm={onConfirmMapping}
            onBack={() => setScreen('upload')}
          />
        )}
        {screen === 'dashboard' && (
          <DashboardScreen
            rows={extraction.rows}
            running={extraction.running}
            editing={extraction.editing}
            editValue={extraction.editValue}
            total={extraction.total}
            done={extraction.done}
            errCount={extraction.errCount}
            unsupported={extraction.unsupported}
            processing={extraction.processing}
            pending={extraction.pending}
            hasAuth={extraction.hasAuth}
            allDone={extraction.allDone}
            allFailed={extraction.allFailed}
            progress={extraction.progress}
            onRun={extraction.runAll}
            onDownload={extraction.download}
            onNewFile={onNewFile}
            onEditValue={extraction.setEditValue}
            onStartEdit={extraction.startEdit}
            onCommitEdit={extraction.commitEdit}
            onCancelEdit={() => extraction.setEditing(null)}
            onRerun={extraction.rerun}
          />
        )}
      </main>

      <ToastStack toasts={toasts} />
    </div>
  );
}
