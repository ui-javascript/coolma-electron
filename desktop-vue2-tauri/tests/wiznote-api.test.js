jest.mock('boot/request', () => ({ execRequest: jest.fn() }), { virtual: true })
jest.mock('src/services/imageCustomWebUploadService', () => ({}), { virtual: true })
jest.mock('src/utils/storage/ServerFileStorage', () => ({}), { virtual: true })

const { execRequest } = require('boot/request')
const { AccountServerApi, KnowledgeBaseApi } = require('../src/utils/api').default

beforeEach(() => execRequest.mockReset())

test('self-hosted login keeps credentials and the note session on the chosen server', async () => {
  execRequest.mockResolvedValueOnce({ token: 'fixture-token', kbGuid: 'fixture-kb', kbServer: 'http://internal:8080' })
  const auth = await AccountServerApi.Login({ url: 'http://localhost:12380/wiz///', userId: 'fixture', password: 'fixture-password' })
  expect(execRequest).toHaveBeenNthCalledWith(1, 'POST', 'http://localhost:12380/wiz/as/user/login',
    { userId: 'fixture', password: 'fixture-password' }, null, { skipWizToken: true, wiznote: true })
  expect(auth.kbServer).toBe('http://localhost:12380/wiz')

  const query = { category: '/工作/', start: 0, count: 20 }
  await KnowledgeBaseApi.getCategoryNotes({ kbGuid: auth.kbGuid, data: query })
  expect(execRequest).toHaveBeenNthCalledWith(2, 'GET', 'http://localhost:12380/wiz/ks/note/list/category/fixture-kb',
    null, null, { params: query, wiznote: true })
})

test('official login accepts the official HTTPS knowledge base', async () => {
  execRequest.mockResolvedValueOnce({ token: 'fixture-token', kbGuid: 'fixture-kb', kbServer: 'https://ks1.wiz.cn/' })
  await AccountServerApi.Login({ url: null, userId: 'fixture', password: 'fixture-password' })
  expect(KnowledgeBaseApi.getBaseUrl()).toBe('https://ks1.wiz.cn')
})

test('a failed server switch keeps account requests on the previous server', async () => {
  AccountServerApi.setBaseUrl('https://previous.test')
  execRequest.mockRejectedValueOnce(new Error('fixture failure'))
  await expect(AccountServerApi.Login({ url: 'https://other.test', userId: 'fixture', password: 'fixture-password' })).rejects.toThrow('fixture failure')
  await AccountServerApi.keepTokenAlive()
  expect(execRequest.mock.calls[1][1]).toBe('https://previous.test/as/user/keep')
})

test('image uploads send browser multipart data to the current knowledge base', async () => {
  KnowledgeBaseApi.setBaseUrl('https://ks1.wiz.cn')
  const formData = new FormData()
  formData.append('data', new Blob(['image']), 'fixture.png')
  await KnowledgeBaseApi.uploadImage({ kbGuid: 'fixture-kb', docGuid: 'fixture-note', formData })
  expect(execRequest).toHaveBeenCalledWith('POST', 'https://ks1.wiz.cn/ks/resource/upload/fixture-kb/fixture-note',
    formData, null, { wiznote: true, multipart: true })
})
