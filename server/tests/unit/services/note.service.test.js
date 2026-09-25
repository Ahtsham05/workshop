const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const noteService = require('../../../src/services/note.service');
const { Note } = require('../../../src/models');

setupTestDB();

const ORG = new mongoose.Types.ObjectId();
const OTHER_ORG = new mongoose.Types.ObjectId();
const BRANCH_A = new mongoose.Types.ObjectId();
const BRANCH_B = new mongoose.Types.ObjectId();
const ME = new mongoose.Types.ObjectId();
const COLLEAGUE = new mongoose.Types.ObjectId();

const myScope = { organizationId: ORG, branchId: BRANCH_A, userId: ME };
const colleagueScope = { organizationId: ORG, branchId: BRANCH_A, userId: COLLEAGUE };

describe('sanitizeContent', () => {
  test('strips scripts, event handlers and javascript: urls but keeps formatting', () => {
    const dirty =
      '<div onclick="steal()"><b>bold</b></div><script>evil()</script><a href="javascript:alert(1)">x</a><ul><li>item</li></ul>';
    const clean = noteService.sanitizeContent(dirty);
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).toContain('<b>bold</b>');
    expect(clean).toContain('<li>item</li>');
  });
});

describe('toPlainText', () => {
  test('block tags become newlines so search does not run words together', () => {
    expect(noteService.toPlainText('<div>Line 1</div><div>Line 2</div>')).toBe('Line 1\nLine 2');
    expect(noteService.toPlainText('<ul><li>a</li><li>b</li></ul>')).toBe('a\nb');
    expect(noteService.toPlainText('a&nbsp;&amp;&nbsp;b')).toBe('a & b');
  });
});

describe('createNote', () => {
  test('derives the title from the first line when none was typed', async () => {
    const note = await noteService.createNote(
      { content: '<div>Call Ahmed about the invoice</div><div>then order stock</div>' },
      myScope,
    );
    expect(note.title).toBe('Call Ahmed about the invoice');
    expect(note.plainText).toBe('Call Ahmed about the invoice\nthen order stock');
    expect(note.visibility).toBe('private');
    expect(String(note.ownerId)).toBe(String(ME));
  });

  test('the same clientId never creates a second note (offline draft synced twice)', async () => {
    const first = await noteService.createNote({ content: 'offline', clientId: 'draft-1' }, myScope);
    const second = await noteService.createNote({ content: 'offline', clientId: 'draft-1' }, myScope);
    expect(String(second.id)).toBe(String(first.id));
    expect(await Note.countDocuments({ clientId: 'draft-1' })).toBe(1);
  });

  test('normalizes tags: trimmed, de-duplicated case-insensitively', async () => {
    const note = await noteService.createNote({ content: 'x', tags: ['VAT', ' vat ', 'stock', ''] }, myScope);
    expect(note.tags).toEqual(['VAT', 'stock']);
  });
});

describe('listNotes visibility', () => {
  beforeEach(async () => {
    await noteService.createNote({ title: 'Mine private', content: 'secret' }, myScope);
    await noteService.createNote({ title: 'Theirs private', content: 'theirs' }, colleagueScope);
    await noteService.createNote({ title: 'Theirs branch', content: 'shared', visibility: 'branch' }, colleagueScope);
    await noteService.createNote(
      { title: 'Theirs org', content: 'company wide', visibility: 'organization' },
      { ...colleagueScope, branchId: BRANCH_B },
    );
    await noteService.createNote({ title: 'Other org', content: 'nope', visibility: 'organization' }, {
      organizationId: OTHER_ORG,
      branchId: BRANCH_A,
      userId: COLLEAGUE,
    });
  });

  test('I see my own notes plus branch/org notes others shared — never their private ones', async () => {
    const { results } = await noteService.listNotes({}, myScope);
    const titles = results.map((note) => note.title).sort();
    expect(titles).toEqual(['Mine private', 'Theirs branch', 'Theirs org']);
  });

  test('a branch-shared note is invisible from a different branch', async () => {
    const { results } = await noteService.listNotes({}, { ...myScope, branchId: BRANCH_B });
    const titles = results.map((note) => note.title).sort();
    expect(titles).toEqual(['Mine private', 'Theirs org']);
  });

  test('search keeps the visibility rules instead of replacing them', async () => {
    const { results } = await noteService.listNotes({ search: 'theirs' }, myScope);
    // Both shared notes match; "Theirs private" matches the text too but is not
    // mine to see — the search clause must be ANDed with the visibility clause,
    // not written over it.
    expect(results.map((note) => note.title).sort()).toEqual(['Theirs branch', 'Theirs org']);
  });

  test('mine=true narrows to my own notes', async () => {
    const { results } = await noteService.listNotes({ mine: 'true' }, myScope);
    expect(results.map((note) => note.title)).toEqual(['Mine private']);
  });
});

describe('updateNote', () => {
  test('only the owner can write, even to a note shared with them', async () => {
    const note = await noteService.createNote({ title: 'Shared', content: 'a', visibility: 'branch' }, colleagueScope);
    await expect(noteService.updateNote(note.id, { content: 'hacked' }, myScope)).rejects.toThrow('Note not found');
  });

  test('editing the body re-derives an empty title and refreshes plainText', async () => {
    const note = await noteService.createNote({ content: '<div>first</div>' }, myScope);
    const updated = await noteService.updateNote(note.id, { title: '', content: '<div>second line</div>' }, myScope);
    expect(updated.title).toBe('second line');
    expect(updated.plainText).toBe('second line');
  });

  test('an explicit title survives later body edits', async () => {
    const note = await noteService.createNote({ title: 'Stock plan', content: 'a' }, myScope);
    const updated = await noteService.updateNote(note.id, { content: '<div>b</div>' }, myScope);
    expect(updated.title).toBe('Stock plan');
  });
});

describe('trash lifecycle', () => {
  test('delete → trash → restore, and trash is excluded from the active list', async () => {
    const note = await noteService.createNote({ title: 'Temp', content: 'x', isPinned: true }, myScope);

    const trashed = await noteService.deleteNote(note.id, {}, myScope);
    expect(trashed.isTrashed).toBe(true);
    expect(trashed.isPinned).toBe(false); // a trashed note must not stay pinned to the top

    expect((await noteService.listNotes({}, myScope)).results).toHaveLength(0);
    expect((await noteService.listNotes({ view: 'trash' }, myScope)).results.map((n) => n.title)).toEqual(['Temp']);

    await noteService.restoreNote(note.id, myScope);
    expect((await noteService.listNotes({}, myScope)).results.map((n) => n.title)).toEqual(['Temp']);
  });

  test('deleting an already-trashed note removes it for good', async () => {
    const note = await noteService.createNote({ title: 'Temp', content: 'x' }, myScope);
    await noteService.deleteNote(note.id, {}, myScope);
    await noteService.deleteNote(note.id, {}, myScope);
    expect(await Note.findById(note.id)).toBeNull();
  });

  test('emptyTrash only touches my own trashed notes', async () => {
    const mine = await noteService.createNote({ title: 'Mine', content: 'x' }, myScope);
    const theirs = await noteService.createNote({ title: 'Theirs', content: 'x' }, colleagueScope);
    await noteService.deleteNote(mine.id, {}, myScope);
    await noteService.deleteNote(theirs.id, {}, colleagueScope);

    const result = await noteService.emptyTrash(myScope);
    expect(result.deletedCount).toBe(1);
    expect(await Note.findById(theirs.id)).not.toBeNull();
  });

  test('archived notes live in their own view', async () => {
    const note = await noteService.createNote({ title: 'Old', content: 'x' }, myScope);
    await noteService.updateNote(note.id, { isArchived: true }, myScope);
    expect((await noteService.listNotes({}, myScope)).results).toHaveLength(0);
    expect((await noteService.listNotes({ view: 'archived' }, myScope)).results.map((n) => n.title)).toEqual(['Old']);
  });
});

describe('duplicateNote', () => {
  test("a copy of a colleague's shared note belongs to me and starts private", async () => {
    const source = await noteService.createNote(
      { title: 'Price list', content: '<b>x</b>', visibility: 'branch', tags: ['stock'] },
      colleagueScope,
    );
    const copy = await noteService.duplicateNote(source.id, myScope);
    expect(copy.title).toBe('Price list (copy)');
    expect(String(copy.ownerId)).toBe(String(ME));
    expect(copy.visibility).toBe('private');
    expect(copy.tags).toEqual(['stock']);
  });
});

describe('listTags', () => {
  test('counts tags across the notes I can see, ignoring trashed ones', async () => {
    await noteService.createNote({ content: 'a', tags: ['stock', 'vat'] }, myScope);
    await noteService.createNote({ content: 'b', tags: ['stock'] }, myScope);
    const trashed = await noteService.createNote({ content: 'c', tags: ['gone'] }, myScope);
    await noteService.deleteNote(trashed.id, {}, myScope);
    await noteService.createNote({ content: 'd', tags: ['hidden'] }, colleagueScope);

    const tags = await noteService.listTags(myScope);
    expect(tags).toEqual([
      { tag: 'stock', count: 2 },
      { tag: 'vat', count: 1 },
    ]);
  });
});
