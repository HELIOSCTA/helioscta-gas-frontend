"use client";

import { useEffect, useRef, useCallback } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { basicSetup } from "codemirror";

interface FileEditorProps {
  content: string;
  fileType: string;
  onChange: (content: string) => void;
}

function getLanguage(fileType: string) {
  switch (fileType) {
    case "md":
      return markdown();
    case "py":
      return python();
    case "sql":
      return sql();
    default:
      return [];
  }
}

export default function FileEditor({
  content,
  fileType,
  onChange,
}: FileEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Debounced save
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleUpdate = useCallback((newContent: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChangeRef.current(newContent);
    }, 2000);
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;

    const lang = getLanguage(fileType);

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        oneDark,
        ...(Array.isArray(lang) ? lang : [lang]),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        history(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            handleUpdate(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          "&": { height: "100%", fontSize: "13px" },
          ".cm-scroller": { overflow: "auto" },
          ".cm-content": { fontFamily: "'JetBrains Mono', 'Fira Code', monospace" },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      view.destroy();
    };
  }, [fileType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update content when it changes externally (e.g., file switch)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== content) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: content },
      });
    }
  }, [content]);

  return <div ref={editorRef} className="h-full w-full overflow-hidden" />;
}
