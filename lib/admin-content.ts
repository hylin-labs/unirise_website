export type AdminContentKind = 'news' | 'downloads' | 'knowledge';
export type AdminContentEditor = {
  kind: AdminContentKind;
  id: string;
  legacyId: string;
  title: string;
  lead: string;
  imageUrl: string;
  highlightsText: string;
  videoUrl: string;
  href: string;
  body: string;
  tagsText: string;
  status: 'draft' | 'published';
};

export function emptyAdminContentEditor(
  kind: AdminContentKind,
): AdminContentEditor {
  return {
    kind,
    id: '',
    legacyId: '',
    title: '',
    lead: '',
    imageUrl: '',
    highlightsText: '',
    videoUrl: '',
    href: '',
    body: '',
    tagsText: '',
    status: 'draft',
  };
}

function idField(id: string) {
  return id ? { id } : {};
}

export function buildAdminContentPayload(editor: AdminContentEditor) {
  if (editor.kind === 'news') {
    return {
      ...idField(editor.id),
      legacyId: editor.legacyId,
      title: editor.title,
      lead: editor.lead,
      imageUrl: editor.imageUrl,
      highlights: editor.highlightsText
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
      videoUrl: editor.videoUrl || null,
      status: editor.status,
    };
  }
  if (editor.kind === 'downloads') {
    return {
      ...idField(editor.id),
      legacyId: editor.legacyId,
      title: editor.title,
      status: editor.status,
    };
  }
  return {
    ...idField(editor.id),
    title: editor.title,
    href: editor.href,
    body: editor.body,
    tags: editor.tagsText
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    status: editor.status,
  };
}
