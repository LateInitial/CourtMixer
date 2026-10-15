// CourtMixer - cloud sync client. Phase 1 (v1.9.1): a no-op stub so every save path already
// reports its changes; the real client (push/pull, conflicts, status) arrives in Phase 7.

const Sync = {
  // Called after every save of a document ("social" or "comp:<id>").
  markDirty: function (docKey) { /* no-op until Phase 7 */ }
};
