import { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router';
import { Shell } from './Shell';

/**
 * The route tree, with every screen behind a lazy import.
 *
 * Statically importing all of them put the whole app in one chunk. Splitting
 * here means the entry bundle carries the shell and nothing else: the builder,
 * AI builder, and entry editor are the heaviest screens, and none is on the
 * path to reading a sheet or browsing the Library, which is what most visits
 * are. Seed content is split separately and per edition — see
 * src/content/loader.ts.
 *
 * Lives in its own module rather than in main.tsx so these component consts sit
 * in a file that exports components, which is what react/only-export-components
 * wants and what keeps fast refresh working for them.
 */
const LibraryPage = lazy(() => import('@/features/library/LibraryPage').then((m) => ({ default: m.LibraryPage })));
const CharactersPage = lazy(() =>
  import('@/features/characters/CharactersPage').then((m) => ({ default: m.CharactersPage })),
);
const BuilderPage = lazy(() =>
  import('@/features/characters/builder/BuilderPage').then((m) => ({ default: m.BuilderPage })),
);
const TemplatesPage = lazy(() =>
  import('@/features/characters/TemplatesPage').then((m) => ({ default: m.TemplatesPage })),
);
const CharacterSheetPage = lazy(() =>
  import('@/features/characters/sheet/CharacterSheetPage').then((m) => ({ default: m.CharacterSheetPage })),
);
const EntryEditorPage = lazy(() =>
  import('@/features/library/editor/EntryEditorPage').then((m) => ({ default: m.EntryEditorPage })),
);
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const AIBuilderPage = lazy(() =>
  import('@/features/characters/ai/AIBuilderPage').then((m) => ({ default: m.AIBuilderPage })),
);
const SignInPage = lazy(() => import('@/features/auth/AuthPages').then((m) => ({ default: m.SignInPage })));
const SignUpPage = lazy(() => import('@/features/auth/AuthPages').then((m) => ({ default: m.SignUpPage })));

export function AppRoutes() {
  return (
    <Routes>
      {/* Shell renders the Suspense boundary itself, around its Outlet, so a
          lazy route resolving doesn't take the header down with it. */}
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/library" replace />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="library/new" element={<EntryEditorPage />} />
        <Route path="characters" element={<CharactersPage />} />
        <Route path="characters/new" element={<BuilderPage />} />
        <Route path="characters/templates" element={<TemplatesPage />} />
        <Route path="characters/ai-new" element={<AIBuilderPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="sign-in/*" element={<SignInPage />} />
        <Route path="sign-up/*" element={<SignUpPage />} />
        <Route path="characters/:id" element={<CharacterSheetPage />} />
      </Route>
    </Routes>
  );
}
