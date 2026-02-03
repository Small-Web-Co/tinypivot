import html2canvas from 'html2canvas'

export async function capturePageThumbnail(
  element: HTMLElement,
  options: { width?: number, height?: number } = {},
): Promise<string> {
  const { width = 400, height = 300 } = options

  const canvas = await html2canvas(element, {
    scale: 0.5,
    useCORS: true,
    logging: false,
    width: element.scrollWidth,
    height: Math.min(element.scrollHeight, 1200),
  })

  const thumbCanvas = document.createElement('canvas')
  thumbCanvas.width = width
  thumbCanvas.height = height
  const ctx = thumbCanvas.getContext('2d')

  if (ctx) {
    ctx.drawImage(canvas, 0, 0, width, height)
  }

  return thumbCanvas.toDataURL('image/jpeg', 0.7)
}
