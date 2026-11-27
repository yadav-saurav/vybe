/** Browse categories. Each genre page and card shows real worldwide songs and covers for that genre. */
export const GENRES: { id: string; name: string; color: string }[] = [
  { id: 'pop', name: 'Pop', color: '#ff3d7f' }, { id: 'hiphop', name: 'Hip-Hop', color: '#ffb000' },
  { id: 'rnb', name: 'R&B', color: '#9d4edd' }, { id: 'electronic', name: 'Electronic', color: '#00e5ff' },
  { id: 'rock', name: 'Rock', color: '#e63946' }, { id: 'indie', name: 'Indie', color: '#2ec4b6' },
  { id: 'jazz', name: 'Jazz', color: '#f4a261' }, { id: 'classical', name: 'Classical', color: '#7b8cde' },
  { id: 'country', name: 'Country', color: '#c77d2e' }, { id: 'latin', name: 'Latin', color: '#ff6b35' },
  { id: 'ambient', name: 'Ambient', color: '#3a86ff' }, { id: 'lofi', name: 'Lo-Fi', color: '#8ac926' },
];
export const genreName = (id: string) => GENRES.find((g) => g.id === id)?.name ?? 'Genre';
