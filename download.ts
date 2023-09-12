export default function triggerDownload(
  filename: string,
  mime: string,
  data: BlobPart | readonly BlobPart[],
) {
  const blob = new Blob(Array.isArray(data) ? data : [data], {
    type: mime.includes('charset') ? mime : `${mime};charset=utf-8`,
    endings: 'transparent',
  })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
