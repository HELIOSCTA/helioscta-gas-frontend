"use client";

interface ImageViewerProps {
  src: string;
  fileName: string;
}

export default function ImageViewer({ src, fileName }: ImageViewerProps) {
  return (
    <div className="flex h-full items-center justify-center bg-[#0b0d14] p-8">
      <div className="flex flex-col items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={fileName}
          className="max-h-[70vh] max-w-full rounded border border-gray-800 object-contain"
        />
        <span className="text-xs text-gray-500">{fileName}</span>
      </div>
    </div>
  );
}
