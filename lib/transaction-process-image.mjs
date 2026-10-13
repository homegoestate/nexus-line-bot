// Planned static asset in this existing project's public/images directory.
// The corrected JPEG was inspected by the parent worker and stored as a GitHub
// binary blob. Release requires the same validated bytes at this exact path.
// This module performs no image editing.
export const TRANSACTION_PROCESS_IMAGE = Object.freeze({
  title: '不動產交易流程與責任分工圖',
  assetPath: 'public/images/transaction-process-responsibilities-20261013.jpg',
  url: 'https://nexus-line-bot.vercel.app/images/transaction-process-responsibilities-20261013.jpg',
  width: 1536,
  height: 1024,
  byteLength: 776323,
  sha256: '05302c9b976f6cb253e5d2587f380dfbded63d0b010e7efd083b533aea885136',
});

export function buildTransactionProcessImageMessage() {
  // A native image message supports the original resolution and native zoom.
  // Reuse the same small JPEG for preview; no cropped or rewritten derivative.
  return { type: 'image', originalContentUrl: TRANSACTION_PROCESS_IMAGE.url, previewImageUrl: TRANSACTION_PROCESS_IMAGE.url };
}
