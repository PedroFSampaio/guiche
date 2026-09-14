export function configurePatientVoice(utterance: SpeechSynthesisUtterance, voices: SpeechSynthesisVoice[]) {
    const localPortuguese = voices.filter(v => v.localService && v.lang.replace('_', '-').toLowerCase().startsWith('pt'));
    const brazilian = localPortuguese.filter(v => v.lang.replace('_', '-').toLowerCase() === 'pt-br');
    const preferred = brazilian.find(v => /natural|neural/i.test(v.name))
        ?? brazilian.find(v => /maria|helena|luciana|francisca/i.test(v.name))
        ?? brazilian[0] ?? localPortuguese[0];
    if (!preferred)
        return false;
    utterance.voice = preferred;
    utterance.lang = 'pt-BR';
    utterance.rate = .92;
    utterance.pitch = 1.04;
    utterance.volume = .85;
    return true;
}
