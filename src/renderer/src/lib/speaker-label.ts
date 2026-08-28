// Renderer-side speaker display label — the one place "Me"/"S2"/"Sarah"/"?"
// is derived. Overlay, LiveMeetingPage, and MeetingView all render through this.

export function speakerDisplay(
  speaker: number,
  isUser: boolean,
  names?: Map<number, string>
): string {
  if (isUser) return 'Me'
  return names?.get(speaker) ?? (speaker >= 0 ? `S${speaker + 1}` : '?')
}
