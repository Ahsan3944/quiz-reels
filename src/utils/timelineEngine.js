import { generateTTS, decodeAudioBuffer, preprocessOptionText } from './audioEngine';

export async function buildAudioTimeline(quiz) {
  const timeline = [];
  let currentTime = 0;

  // Helper to add a segment
  async function addSegment(type, text, lang = 'bn', forcedDuration = null) {
    let audioBuffer = null;
    let duration = forcedDuration || 2.0; // fallback duration if TTS fails
    
    if (text) {
      const mp3Buffer = await generateTTS(text, lang);
      if (mp3Buffer) {
        audioBuffer = await decodeAudioBuffer(mp3Buffer);
        if (audioBuffer) {
          duration = audioBuffer.duration;
        }
      }
    }
    
    // Safety padding for natural speech flow
    // Add 0.3s pause after most segments
    const pause = 0.3;
    
    const segment = {
      type,
      text,
      audioBuffer,
      start: currentTime,
      duration: duration,
      end: currentTime + duration
    };
    
    timeline.push(segment);
    currentTime += duration + pause;
    return segment;
  }

  // 1. Question
  await addSegment('question', quiz.question);

  // 2. Options (separated, short delay between each is handled by the `pause` in addSegment)
  // We want to pronounce "Option 1" in Bengali naturally? "Option Ek"? Or simply "Option 1" which Google TTS reads fine.
  // We can prefix "অপশন" (Option in Bengali script)
  const optionPrefixes = ['অপশন এক, ', 'অপশন দুই, ', 'অপশন তিন, ', 'অপশন চার, '];
  
  for (let i = 0; i < quiz.options.length; i++) {
    const text = preprocessOptionText(quiz.options[i].text);
    if (text) {
      await addSegment(`option${i}`, `${optionPrefixes[i]} ${text}`);
    }
  }

  // 3. Timer Sequence
  // Timer Intro
  await addSegment('timer_intro', 'আপনার সময় শুরু হলো এখন');
  
  // Timer Numbers: 5 to 1. 
  // We want exactly 1 second visual intervals, so we force the timestamp pacing, 
  // overriding the standard `addSegment` flow, or we process them separately.
  const numbersBn = ['৫', '৪', '৩', '২', '১'];
  for (let i = 0; i < numbersBn.length; i++) {
    const mp3Buffer = await generateTTS(numbersBn[i], 'bn');
    let aBuf = mp3Buffer ? await decodeAudioBuffer(mp3Buffer) : null;
    let aDur = aBuf ? aBuf.duration : 1.0;
    
    timeline.push({
      type: `timer_${5 - i}`,
      text: numbersBn[i],
      audioBuffer: aBuf,
      start: currentTime,
      duration: aDur,
      end: currentTime + aDur
    });
    
    // visually each number ticks every 1 second exactly
    // if audio is > 1s, we cap the step so the next number ticks 1s later, 
    // but the audio might overlap briefly (which is fine, though single digits are usually < 1s).
    currentTime += 1.0; 
  }
  
  // Extra pause before showing answer
  currentTime += 0.5;

  // 4. Answer
  const correctOpt = quiz.options[quiz.correctOptionIndex]?.text;
  if (correctOpt) {
    await addSegment('answer', `সঠিক উত্তর হলো: ${preprocessOptionText(correctOpt)}`);
  } else {
    await addSegment('answer', `সঠিক উত্তর নির্বাচিত হয়নি`); // fallback
  }

  // 5. Explanation
  if (quiz.explanation) {
    await addSegment('explanation', quiz.explanation);
  }

  // 6. CTA
  if (quiz.cta) {
    await addSegment('cta', quiz.cta);
  }

  // Add a final buffer
  timeline.push({
    type: 'end_buffer',
    text: '',
    audioBuffer: null,
    start: currentTime,
    duration: 1.0,
    end: currentTime + 1.0
  });

  return {
    segments: timeline,
    totalDuration: currentTime + 1.0
  };
}
