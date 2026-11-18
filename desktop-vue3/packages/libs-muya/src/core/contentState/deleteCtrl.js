import selection from '../selection'
import { tokenizer } from '../parser/'

const deleteCtrl = ContentState => {
  // Get the echo_anno token at cursor position (including at start boundary)
  ContentState.prototype.getEchoTokenAtCursorForDelete = function (block, offset) {
    if (!block || !/atxLine|paragraphContent|cellContent/.test(block.functionType || '')) {
      return null
    }
    const text = String(block.text || '')
    if (!text || text.indexOf('@') === -1) return null
    const tokens = tokenizer(text, {
      hasBeginRules: false,
      options: this.muya.options
    })
    for (const token of tokens) {
      if (token.type === 'echo_anno' && offset >= token.range.start && offset < token.range.end) {
        return token
      }
    }
    return null
  }

  // Handle `delete` keydown event on document.
  ContentState.prototype.docDeleteHandler = function (event) {
    if (this.selectedTableCells) {
      event.preventDefault()
      return this.deleteSelectedTableCells()
    }
  }

  ContentState.prototype.deleteHandler = function (event) {
    const { start, end } = selection.getCursorRange()
    if (!start || !end) {
      return
    }
    const startBlock = this.getBlock(start.key)
    const nextBlock = this.findNextBlockInLocation(startBlock)

    // TODO: @jocs It will delete all the editor and cause error in console when there is only one empty table. same as #67
    if (startBlock.type === 'figure') event.preventDefault()
    // If select multiple paragraph or multiple characters in one paragraph, just let
    // updateCtrl to handle this case.
    if (start.key !== end.key || start.offset !== end.offset) {
      return
    }

    // Handle delete key inside echo_anno token - delete the entire token at once
    const echoToken = this.getEchoTokenAtCursorForDelete(startBlock, start.offset)
    if (echoToken) {
      event.preventDefault()
      const { start: tokenStart, end: tokenEnd } = echoToken.range
      const { text, key } = startBlock
      // Delete the entire echo_anno token
      const newText = text.substring(0, tokenStart) + text.substring(tokenEnd)
      startBlock.text = newText
      const newOffset = tokenStart
      this.cursor = {
        start: { key, offset: newOffset },
        end: { key, offset: newOffset }
      }
      return this.partialRender()
    }

    // Only handle h1~h6 span block
    const { type, text, key } = startBlock
    if (/span/.test(type) && start.offset === 0 && text[1] === '\n') {
      event.preventDefault()
      startBlock.text = text.substring(2)
      this.cursor = {
        start: { key, offset: 0 },
        end: { key, offset: 0 }
      }
      return this.singleRender(startBlock)
    }
    if (
      /h\d|span/.test(type) &&
      start.offset === text.length
    ) {
      event.preventDefault()
      if (nextBlock && /h\d|span/.test(nextBlock.type)) {
        // if cursor at the end of code block-language input, do nothing!
        if (nextBlock.functionType === 'codeContent' && startBlock.functionType === 'languageInput') {
          return
        }

        startBlock.text += nextBlock.text

        const toBeRemoved = [nextBlock]

        let parent = this.getParent(nextBlock)
        let target = nextBlock

        while (this.isOnlyRemoveableChild(target)) {
          toBeRemoved.push(parent)
          target = parent
          parent = this.getParent(parent)
        }

        toBeRemoved.forEach(b => this.removeBlock(b))

        const offset = start.offset
        this.cursor = {
          start: { key, offset },
          end: { key, offset }
        }
        this.render()
      }
    }
  }
}

export default deleteCtrl
