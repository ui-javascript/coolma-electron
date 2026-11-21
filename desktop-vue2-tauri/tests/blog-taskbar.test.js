/* eslint-env jest */
import { taskbarState } from '../src/desktop/blog'

describe('博客部署任务栏进度对齐原版 setProgressBar', () => {
  it('部署中按百分比打到任务栏', () => {
    expect(taskbarState('blog-deploy-progress', { stage: 'build', percent: 42 })).toEqual({
      status: 'normal',
      progress: 0.42
    })
  })

  it('越界百分比夹到 0..1', () => {
    expect(taskbarState('blog-deploy-progress', { percent: 130 })).toEqual({
      status: 'normal',
      progress: 1
    })
    expect(taskbarState('blog-deploy-progress', { percent: -5 })).toEqual({
      status: 'normal',
      progress: 0
    })
  })

  it('结束（成功或失败）清掉进度条', () => {
    expect(taskbarState('blog-deploy-done', {})).toEqual({ status: 'none' })
    expect(taskbarState('blog-deploy-warn', {})).toEqual({ status: 'none' })
  })

  it('无关事件与坏载荷不动进度条', () => {
    expect(taskbarState('sftp-upload-progress', { percent: 20 })).toBeNull()
    expect(taskbarState('blog-deploy-progress', {})).toBeNull()
    expect(taskbarState('blog-deploy-progress', { percent: 'abc' })).toBeNull()
  })
})
