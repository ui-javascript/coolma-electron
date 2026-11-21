/* eslint-env jest */
// Tauri 下接管 Muya 的图片拖拽（Muya 原生实现依赖 Electron 的 File.path）
import { attachImageDrop, createImageDropHandler, hasImageFiles } from '../src/desktop/muyaImageDrop'

const imageFile = (name = 'a.png') => ({ name, type: 'image/png' })

const dropEvent = files => {
  const calls = { preventDefault: 0, stopPropagation: 0 }
  return {
    calls,
    dataTransfer: { files },
    preventDefault: () => { calls.preventDefault++ },
    stopPropagation: () => { calls.stopPropagation++ }
  }
}

describe('hasImageFiles', () => {
  test('识别图片类型', () => {
    expect(hasImageFiles({ dataTransfer: { files: [imageFile()] } })).toBe(true)
    expect(hasImageFiles({ dataTransfer: { files: [{ name: 'a.pdf', type: 'application/pdf' }] } })).toBe(false)
    expect(hasImageFiles({ dataTransfer: { files: [] } })).toBe(false)
    expect(hasImageFiles(null)).toBe(false)
  })
})

describe('createImageDropHandler', () => {
  test('图片文件走 uploadImage 后插到光标处', async () => {
    const uploadImage = jest.fn().mockResolvedValue('http://coolma-resource.localhost/kb/doc/a.png')
    const insertImage = jest.fn()
    const event = dropEvent([imageFile('a.png')])

    const handled = await createImageDropHandler({ uploadImage, insertImage })(event)

    expect(handled).toBe(true)
    expect(event.calls.preventDefault).toBe(1)
    expect(event.calls.stopPropagation).toBe(1)
    expect(uploadImage).toHaveBeenCalledWith(imageFile('a.png'))
    expect(insertImage).toHaveBeenCalledWith({
      alt: 'a.png',
      src: 'http://coolma-resource.localhost/kb/doc/a.png'
    })
  })

  test('多张图片依次插入', async () => {
    const uploadImage = jest.fn()
      .mockResolvedValueOnce('u1')
      .mockResolvedValueOnce('u2')
    const insertImage = jest.fn()

    await createImageDropHandler({ uploadImage, insertImage })(dropEvent([imageFile('1.png'), imageFile('2.png')]))

    expect(insertImage).toHaveBeenCalledTimes(2)
    expect(insertImage.mock.calls[0][0]).toEqual({ alt: '1.png', src: 'u1' })
    expect(insertImage.mock.calls[1][0]).toEqual({ alt: '2.png', src: 'u2' })
  })

  test('没有文件时不动事件（留给页面其他逻辑）', async () => {
    const event = dropEvent([])
    const handled = await createImageDropHandler({ uploadImage: jest.fn(), insertImage: jest.fn() })(event)

    expect(handled).toBe(false)
    expect(event.calls.preventDefault).toBe(0)
    expect(event.calls.stopPropagation).toBe(0)
  })

  test('非图片文件不接管，也不阻止默认行为', async () => {
    const uploadImage = jest.fn()
    const event = dropEvent([{ name: 'x.pdf', type: 'application/pdf' }])
    const handled = await createImageDropHandler({ uploadImage, insertImage: jest.fn() })(event)

    expect(handled).toBe(false)
    expect(uploadImage).not.toHaveBeenCalled()
    expect(event.calls.preventDefault).toBe(0)
  })

  test('上传抛错时回调 onError，不插入坏 src', async () => {
    const error = new Error('boom')
    const uploadImage = jest.fn().mockRejectedValue(error)
    const insertImage = jest.fn()
    const onError = jest.fn()

    const handled = await createImageDropHandler({ uploadImage, insertImage, onError })(dropEvent([imageFile()]))

    expect(handled).toBe(true)
    expect(onError).toHaveBeenCalledWith(error, imageFile())
    expect(insertImage).not.toHaveBeenCalled()
  })

  test('上传返回空值时不插入', async () => {
    const insertImage = jest.fn()
    await createImageDropHandler({ uploadImage: jest.fn().mockResolvedValue(''), insertImage })(dropEvent([imageFile()]))
    expect(insertImage).not.toHaveBeenCalled()
  })
})

describe('attachImageDrop', () => {
  const fakeContainer = () => {
    const listeners = new Map()
    return {
      listeners,
      addEventListener: (type, fn, capture) => listeners.set(`${type}:${capture}`, fn),
      removeEventListener: (type, fn, capture) => listeners.delete(`${type}:${capture}`)
    }
  }

  test('dragover 遇到图片才 preventDefault', () => {
    const container = fakeContainer()
    attachImageDrop(container, jest.fn())
    const onDragOver = container.listeners.get('dragover:true')

    const withImage = dropEvent([imageFile()])
    onDragOver(withImage)
    expect(withImage.calls.preventDefault).toBe(1)

    const withoutImage = dropEvent([{ name: 'x.pdf', type: 'application/pdf' }])
    onDragOver(withoutImage)
    expect(withoutImage.calls.preventDefault).toBe(0)
  })

  test('drop 与 dragover 都挂 capture 阶段，解绑后全部移除', () => {
    const container = fakeContainer()
    const detach = attachImageDrop(container, jest.fn())

    expect(container.listeners.has('dragover:true')).toBe(true)
    expect(container.listeners.has('drop:true')).toBe(true)

    detach()
    expect(container.listeners.size).toBe(0)
  })

  test('容器不可用时不炸，返回空解绑函数', () => {
    expect(() => attachImageDrop(null, jest.fn())()).not.toThrow()
  })
})
