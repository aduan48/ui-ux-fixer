/** Save text as a file through the browser's download flow. */
export const downloadText = (fileName: string, text: string, type: string) => downloadBlob(fileName, new Blob([text], { type }))

export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
