"use client";

import { useState } from "react";

interface SqlEditorToolbarProps {
  onRun: (dialect: "postgresql" | "mssql") => void;
  onValidate: () => void;
  running?: boolean;
}

export default function SqlEditorToolbar({ onRun, onValidate, running }: SqlEditorToolbarProps) {
  const [dialect, setDialect] = useState<"postgresql" | "mssql">("postgresql");

  return (
    <div className="flex items-center gap-2 border-b border-gray-800 bg-[#0b0d14] px-4 py-1.5">
      {/* Dialect selector */}
      <select
        value={dialect}
        onChange={(e) => setDialect(e.target.value as "postgresql" | "mssql")}
        className="rounded border border-gray-700 bg-gray-900 px-2 py-0.5 text-[10px] text-gray-300 focus:border-cyan-700 focus:outline-none"
      >
        <option value="postgresql">PostgreSQL</option>
        <option value="mssql">Azure SQL</option>
      </select>

      {/* Run button */}
      <button
        onClick={() => onRun(dialect)}
        disabled={running}
        className="rounded bg-cyan-700 px-2.5 py-0.5 text-[10px] font-medium text-white hover:bg-cyan-600 disabled:opacity-50"
      >
        {running ? "Running..." : "Run"}
      </button>

      {/* Validate button */}
      <button
        onClick={onValidate}
        className="rounded border border-gray-700 px-2.5 py-0.5 text-[10px] text-gray-400 hover:border-gray-600 hover:text-gray-300"
      >
        Validate
      </button>
    </div>
  );
}
