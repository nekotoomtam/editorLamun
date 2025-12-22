"use client";

import { EditorStoreProvider } from "../../packages/editor-ui/store/editorStore";
import { EditorApp } from "../../packages/editor-ui/EditorApp";
import { mockDoc } from "../../packages/editor-ui/mockDoc";

export default function EditorPage() {
  return (
    <EditorStoreProvider initialDoc={mockDoc}>
      <EditorApp />
    </EditorStoreProvider>
  );
}
