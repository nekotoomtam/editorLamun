"use client";

import { EditorStoreProvider } from "../../packages/editor-ui/store/editorStore";
import { EditorApp } from "../../packages/editor-ui/EditorApp";
import { emptyDoc } from "../../packages/editor-ui/emptyDoc";

export default function EditorPage() {
  return (
    <EditorStoreProvider initialDoc={emptyDoc}>
      <EditorApp />
    </EditorStoreProvider>
  );
}
