import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

export default function FileDropzone({ onFiles, disabled }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !disabled && inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition ${
        dragging ? 'border-cyan-400 bg-cyan-500/5' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-900/50'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <UploadCloud className={`h-10 w-10 ${dragging ? 'text-cyan-400' : 'text-slate-500'}`} />
      <p className="mt-4 text-sm font-medium text-slate-200">Drag and drop source files here</p>
      <p className="mt-1 text-xs text-slate-500">or click to browse. Up to 40 files, 100MB each. Zip archives are supported.</p>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
