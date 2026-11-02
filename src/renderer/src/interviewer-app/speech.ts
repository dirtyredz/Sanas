/** Use only local OS voices. Never fall back to a remote browser speech service. */
export async function localVoice(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const voices = synth.getVoices().filter((v) => v.localService)
    const voice =
      voices.find((v) => v.default && v.lang.startsWith('en')) ??
      voices.find((v) => v.lang.startsWith('en')) ??
      voices[0]
    if (voice) return voice
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('No offline Windows speech voice is available.')
}
