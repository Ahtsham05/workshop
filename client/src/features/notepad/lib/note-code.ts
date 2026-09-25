/** True when the note's body has a real code block (the "Code block" toolbar button emits `<pre>`). */
export const hasCodeBlock = (content: string | undefined): boolean => /<pre[\s>]/i.test(content || '')
