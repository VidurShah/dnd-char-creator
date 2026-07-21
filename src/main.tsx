import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import './index.css';
import { Shell } from './app/Shell';
import { LibraryPage } from './features/library/LibraryPage';
import { CharactersPage } from './features/characters/CharactersPage';
import { BuilderPage } from './features/characters/builder/BuilderPage';
import { TemplatesPage } from './features/characters/TemplatesPage';
import { CharacterSheetPage } from './features/characters/sheet/CharacterSheetPage';
import { EntryEditorPage } from './features/library/editor/EntryEditorPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { AIBuilderPage } from './features/characters/ai/AIBuilderPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Navigate to="/library" replace />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="library/new" element={<EntryEditorPage />} />
          <Route path="characters" element={<CharactersPage />} />
          <Route path="characters/new" element={<BuilderPage />} />
          <Route path="characters/templates" element={<TemplatesPage />} />
          <Route path="characters/ai-new" element={<AIBuilderPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="characters/:id" element={<CharacterSheetPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
