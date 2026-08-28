// Composition point: THE selected STT provider. Everything outside services/stt/
// imports from here — swapping providers stays a one-line change.
export { deepgramProvider as sttProvider } from './deepgram'
