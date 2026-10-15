/* iframe srcdoc yang diisi setelah terpasang. Chrome kadang tidak memuat srcdoc yang sudah ada saat
   React memasang iframe (dokumen tetap about:blank), jadi isinya selalu ditulis lewat properti. */
import { useEffect, useRef } from 'react';

export function SrcDocFrame({ doc, title, sandbox, className }: { doc: string; title: string; sandbox: string; className?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => { if (ref.current && ref.current.srcdoc !== doc) ref.current.srcdoc = doc; }, [doc]);
  return <iframe ref={ref} title={title} sandbox={sandbox} className={className} tabIndex={-1} />;
}
