import { SignInSheet } from './SignInSheet';
import { AddToPlaylistSheet } from './AddToPlaylistSheet';
import { PlaylistEditorSheet } from './PlaylistEditorSheet';
import { ShareSheet } from './ShareSheet';

/** Global modal sheets, mounted once in Layout. Each one is driven by a flag or payload in the ui store. */
export function Overlays() {
  return (
    <>
      <SignInSheet />
      <AddToPlaylistSheet />
      <PlaylistEditorSheet />
      <ShareSheet />
    </>
  );
}
