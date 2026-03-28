import * as Mp4Muxer from 'mp4-muxer';
import { buildAudioTimeline } from './timelineEngine';

export function exportQuizProgrammatically(quiz, onProgress) {
  return new Promise(async (resolve, reject) => {
    try {

  const width = 400;
  const height = 712; // Logical bounds 9:16
  const fps = 30;

  onProgress(0.01); 
  const timelineData = await buildAudioTimeline(quiz);
  const totalFrames = Math.ceil(timelineData.totalDuration * fps);

  const resolutions = [
    { w: 1080, h: 1920, bitrate: 15_000_000, codec: 'avc1.640028' },
    { w: 720, h: 1280, bitrate: 8_000_000, codec: 'avc1.4d001f' }
  ];

  let physWidth = 1080;
  let physHeight = 1920;
  let finalConfig = null;

  for (const res of resolutions) {
    const config = {
      codec: res.codec,
      width: res.w,
      height: res.h,
      bitrate: res.bitrate,
      framerate: fps,
      hardwareAcceleration: 'prefer-hardware'
    };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) {
        physWidth = res.w;
        physHeight = res.h;
        finalConfig = config;
        break;
      }
    } catch (e) { } 
  }

  if (!finalConfig) {
    finalConfig = { codec: 'avc1.42E01F', width: physWidth, height: physHeight, bitrate: 10000000, framerate: fps };
  }

  const exportScaleX = physWidth / width;
  const exportScaleY = physHeight / height;

  const canvas = window.OffscreenCanvas ? new OffscreenCanvas(physWidth, physHeight) : document.createElement("canvas");
  if (!window.OffscreenCanvas) {
    canvas.width = physWidth;
    canvas.height = physHeight;
  }
  const ctx = canvas.getContext("2d");

  const themes = {
    default: { bg: '#0f172a', surface: '#1e293b', text: '#e2e8f0', accent: '#3b82f6', correct: '#10b981', patternUrl: null },
    vibrant: { bg: '#2e1065', surface: '#4c1d95', text: '#f5f3ff', accent: '#8b5cf6', correct: '#10b981', patternUrl: null },
    nature: { bg: '#064e3b', surface: '#065f46', text: '#ecfdf5', accent: '#10b981', correct: '#10b981', patternUrl: null },
    'islamic-gold': { bg: '#422006', surface: '#713f12', text: '#fef08a', accent: '#eab308', correct: '#10b981', patternUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cpath fill='%23fef08a' fill-opacity='0.04' d='M40 0l5 15 15 5-15 5-5 15-5-15-15-5 15-5z'/%3E%3C/svg%3E" },
    'islamic-emerald': { bg: '#022c22', surface: '#064e3b', text: '#ecfdf5', accent: '#10b981', correct: '#10b981', patternUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cpath fill='%23ecfdf5' fill-opacity='0.03' d='M40 0l5 15 15 5-15 5-5 15-5-15-15-5 15-5z'/%3E%3C/svg%3E" },
    'islamic-night': { bg: '#0f172a', surface: '#1e293b', text: '#e2e8f0', accent: '#38bdf8', correct: '#10b981', patternUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cpath fill='%23e2e8f0' fill-opacity='0.02' d='M40 0l5 15 15 5-15 5-5 15-5-15-15-5 15-5z'/%3E%3C/svg%3E" }
  };
  const theme = themes[quiz.config.theme] || themes.default;
  const animType = quiz.config.animation || 'slideUp';

  let img = null;
  if (quiz.image) {
    img = new Image();
    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve; 
      img.src = quiz.image;
    });
  }

  let patternImg = null;
  if (theme.patternUrl) {
    patternImg = new Image();
    await new Promise((resolve) => {
      patternImg.onload = resolve;
      patternImg.onerror = resolve;
      patternImg.src = theme.patternUrl;
    });
  }

  if (!Mp4Muxer) throw new Error("mp4-muxer module not found.");

  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width: physWidth, height: physHeight },
    audio: { codec: 'aac', sampleRate: 44100, numberOfChannels: 1 },
    fastStart: 'in-memory',
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => reject(e)
  });
  encoder.configure(finalConfig);

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => console.error("Audio Encoding Error:", e)
  });
  audioEncoder.configure({
    codec: 'mp4a.40.2',
    sampleRate: 44100,
    numberOfChannels: 1,
    bitrate: 128000
  });

  // ENCODE ALL AUDIO TIMELINE BUFFERS IN CHUNKS
  for (const seg of timelineData.segments) {
    if (seg.audioBuffer && seg.duration > 0) {
      try {
        const aBuf = seg.audioBuffer;
        const offlineCtx = new OfflineAudioContext(1, Math.ceil(44100 * aBuf.duration), 44100);
        const source = offlineCtx.createBufferSource();
        source.buffer = aBuf;
        source.connect(offlineCtx.destination);
        source.start(0);
        const resampledAudio = await offlineCtx.startRendering();

        const channelData = resampledAudio.getChannelData(0);
        let timestampUs = Math.round(seg.start * 1_000_000);
        
        // Chunk limit fixing the exact issue described by user ("No voice is present")
        const chunkSize = 4096; 
        for (let i = 0; i < channelData.length; i += chunkSize) {
          const size = Math.min(chunkSize, channelData.length - i);
          const chunkData = new Float32Array(size);
          chunkData.set(channelData.subarray(i, i + size));
          
          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate: 44100,
            numberOfChannels: 1,
            numberOfFrames: size,
            timestamp: timestampUs,
            data: chunkData
          });
          audioEncoder.encode(audioData);
          audioData.close();
          timestampUs += Math.round((size / 44100) * 1_000_000);
        }
      } catch (ax) {
        console.warn("Failed encoding audio chunk:", ax);
      }
    }
  }
  await audioEncoder.flush();

  function getAnimProps(t, appearT, pDuration = 0.8) {
    if (t < appearT) return { op: 0, off: 0, scale: 1 };
    if (t >= appearT + pDuration) return { op: 1, off: 0, scale: 1 };
    const p = (t - appearT) / pDuration;
    const pOut = 1 - Math.pow(1 - p, 4); 
    const op = pOut;
    const off = animType === 'slideUp' ? 40 * (1 - pOut) : 0;
    const scale = animType === 'zoomIn' ? 0.85 + (0.15 * pOut) : 1;
    return { op, off, scale };
  }

  function getSegmentTime(typeKey) {
    const seg = timelineData.segments.find(s => s.type === typeKey);
    return seg ? seg.start : 9999;
  }

  const qAppT = getSegmentTime('question');
  const oAppTs = [getSegmentTime('option0'), getSegmentTime('option1'), getSegmentTime('option2'), getSegmentTime('option3')];
  const tStartT = getSegmentTime('timer_intro');
  const tTicks = [getSegmentTime('timer_5'), getSegmentTime('timer_4'), getSegmentTime('timer_3'), getSegmentTime('timer_2'), getSegmentTime('timer_1')];
  
  const aAppT = getSegmentTime('answer');
  const xAppT = getSegmentTime('explanation');
  const cAppT = getSegmentTime('cta');

  for (let f = 0; f < totalFrames; f++) {
    const t = f / fps;

    ctx.save();
    ctx.scale(exportScaleX, exportScaleY);

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, width, height);

    if (patternImg) {
      if (!ctx.pattern) ctx.pattern = ctx.createPattern(patternImg, 'repeat');
      ctx.fillStyle = ctx.pattern;
      ctx.fillRect(0, 0, width, height);
    }

    // Question
    const { op: qOpacity, off: qOffset, scale: qScale } = getAnimProps(t, qAppT, 1.0);
    ctx.globalAlpha = qOpacity;
    ctx.fillStyle = theme.text;
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    ctx.save();
    ctx.translate(width / 2, 70 + qOffset);
    if (qScale !== 1) ctx.scale(qScale, qScale);
    wrapText(ctx, quiz.question, 0, 0, width - 40, 34);
    ctx.restore();
    ctx.globalAlpha = 1;

    // Options
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const optW = width - 60;
    const optH = 44;
    const boxType = quiz.config.boxStyle || 'solid';

    quiz.options.forEach((opt, i) => {
      const optAppearT = oAppTs[i];
      let { op: opOpacity, off: opOffset, scale: opScale } = getAnimProps(t, optAppearT, 0.8);
      
      const isCorrect = i === quiz.correctOptionIndex;
      let activeBg = theme.surface;
      let boxColor = theme.text;
      
      if (t >= aAppT) {
        if (isCorrect) {
          activeBg = theme.correct || '#10b981';
          boxColor = '#ffffff';
          const tReveal = Math.min(1.0, (t - aAppT) / 0.5);
          opScale = opScale * (1.0 + Math.sin(tReveal * Math.PI) * 0.05);
        } else {
          opOpacity *= 0.4;
        }
      }

      ctx.globalAlpha = opOpacity;
      // Fixed base positioning for options perfectly
      const yBase = 160 + (i * (optH + 14));
      
      ctx.save();
      ctx.translate(width / 2, yBase + optH / 2 + opOffset);
      if (opScale !== 1) ctx.scale(opScale, opScale);
      
      const xOrigin = -optW / 2;
      const yOrigin = -optH / 2;

      if (boxType === 'solid') {
        buildRoundedPath(ctx, xOrigin, yOrigin, optW, optH, 12);
        ctx.fillStyle = activeBg;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (boxType === 'crystal') {
        const grad = ctx.createLinearGradient(xOrigin, yOrigin, xOrigin + optW, yOrigin + optH);
        if (t >= aAppT && isCorrect) {
          grad.addColorStop(0, '#10b981');
          grad.addColorStop(1, 'rgba(16, 185, 129, 0.4)');
        } else {
          grad.addColorStop(0, "rgba(255,255,255,0.15)");
          grad.addColorStop(1, "rgba(255,255,255,0.02)");
        }
        buildRoundedPath(ctx, xOrigin, yOrigin, optW, optH, 12);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (boxType === '3d') {
        ctx.translate(0, -2);
        ctx.translate(0, 5); 
        buildRoundedPath(ctx, xOrigin, yOrigin, optW, optH, 12);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.translate(0, -5);
        buildRoundedPath(ctx, xOrigin, yOrigin, optW, optH, 12);
        ctx.fillStyle = activeBg;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (boxType === 'neon') {
        buildRoundedPath(ctx, xOrigin, yOrigin, optW, optH, 12);
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fill();
        const bCol = (t >= aAppT && isCorrect) ? '#10b981' : theme.accent;
        ctx.strokeStyle = bCol;
        ctx.lineWidth = 2;
        ctx.shadowColor = bCol;
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowColor = "transparent";
      }

      ctx.fillStyle = boxColor;
      ctx.fillText(`Option ${i+1}: ${opt.text}`, xOrigin + 16, 2);

      if (t >= aAppT && isCorrect) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        const cX = Math.abs(xOrigin) * 2 - 20;
        ctx.moveTo(cX - 8, 0);
        ctx.lineTo(cX - 2, 6);
        ctx.lineTo(cX + 8, -8);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    });

    // Circular Timer Engine
    const { op: tOp, scale: tSc } = getAnimProps(t, tStartT, 0.5);
    if (tOp > 0 && t < aAppT) { 
      ctx.globalAlpha = tOp;
      ctx.save();
      // Proper fixed position away from bottom CTA/Explanation area
      ctx.translate(width / 2, 450);
      if (tSc !== 1) ctx.scale(tSc, tSc);
      
      let currentNum = '';
      for (let i = 0; i < tTicks.length; i++) {
        if (tTicks[i] <= t) currentNum = ['5','4','3','2','1'][i];
      }
      
      ctx.beginPath();
      ctx.arc(0, 0, 40, 0, Math.PI * 2);
      ctx.fillStyle = theme.surface;
      ctx.fill();
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 4;
      ctx.stroke();
      
      if (currentNum) {
        ctx.fillStyle = theme.text;
        ctx.font = "bold 32px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(currentNum, 0, 2);
      } else {
        ctx.fillStyle = theme.text;
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Ready", 0, 2);
      }
      
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Explanation Area Alignment Fix
    if (quiz.explanation && t >= xAppT) {
      const { op: xOp, off: xOff } = getAnimProps(t, xAppT, 1.0);
      ctx.globalAlpha = xOp;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; 
      
      const expY = 460; 
      const expH = 140; 
      
      // bounded overlay rect
      ctx.fillRect(20, expY + xOff, width - 40, expH);
      
      ctx.fillStyle = '#10b981'; 
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("Explanation:", 35, expY + 20 + xOff);
      
      // We clip so it doesn't overflow to CTA area
      ctx.save();
      ctx.beginPath();
      ctx.rect(35, expY + 30 + xOff, width - 70, expH - 40);
      ctx.clip();
      
      ctx.fillStyle = "white";
      ctx.font = "16px sans-serif";
      ctx.textBaseline = "top";
      wrapText(ctx, quiz.explanation, 35, expY + 40 + xOff, width - 70, 22);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    
    // REDESIGNED CTA (Animated Button + Click)
    if (quiz.cta && t >= cAppT) {
      const isSubscribe = /subscribe|সাবস্ক্রাইব/i.test(quiz.cta);
      const btnText = isSubscribe ? "SUBSCRIBE" : "FOLLOW";
      const btnColor = isSubscribe ? "#ef4444" : "#3b82f6"; // Red or Blue
      const btnWidth = 180;
      const btnHeight = 50;

      const { op: cOp, off: cOff } = getAnimProps(t, cAppT, 0.8);
      ctx.globalAlpha = cOp;
      
      ctx.save();
      const ctaY = height - 60; // Bottom anchored safely inside 9:16
      ctx.translate(width / 2, ctaY + cOff);
      
      // Timeline-driven tap logic
      const clickTime = cAppT + 1.2;
      let scale = 1.0;
      
      // Button press effect exactly at `clickTime`
      if (t >= clickTime && t < clickTime + 0.4) {
         const pressP = Math.max(0, 1 - Math.abs(t - clickTime) / 0.1);
         scale = 1.0 - (pressP * 0.1); 
      }
      
      ctx.scale(scale, scale);
      
      buildRoundedPath(ctx, -btnWidth/2, -btnHeight/2, btnWidth, btnHeight, 25);
      ctx.fillStyle = btnColor;
      ctx.shadowColor = btnColor;
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.shadowColor = "transparent";
      
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(btnText, 0, 2);
      ctx.restore();

      // Hand Pointer Animation sliding from bottom to click it
      ctx.save();
      let handY = ctaY + 80; // starts low
      let handX = width / 2 + 30; // 30px to right of center
      
      if (t >= cAppT + 0.5) {
         const slideIn = Math.min(1.0, (t - (cAppT + 0.5)) / 0.4);
         const slideCurve = 1 - Math.pow(1 - slideIn, 3);
         handY = ctaY + 80 - (slideCurve * 60); // stops inside button essentially

         ctx.font = "34px sans-serif"; 
         ctx.fillText("👆", handX, handY);

         // Tap ripple exact sync with button press
         if (t >= clickTime) {
           const ripLife = Math.min(1.0, (t - clickTime) / 0.5);
           ctx.beginPath();
           ctx.arc(handX - 5, handY - 10, ripLife * 30, 0, Math.PI * 2);
           ctx.strokeStyle = `rgba(255,255,255,${1.0 - ripLife})`;
           ctx.lineWidth = 4;
           ctx.stroke();
         }
      }
      ctx.restore();
      
      ctx.globalAlpha = 1;
    }

    if (img && t < aAppT) { 
        const { op: imgOp } = getAnimProps(t, 2.0, 1.0); 
        const fadeOut = Math.max(0, 1 - (t - aAppT) * 2);
        const finalOp = imgOp * fadeOut;
        if (finalOp > 0) {
            ctx.globalAlpha = finalOp;
            const imgH = 150;
            const imgY = 440; // safely above Explanation bounding box
            ctx.drawImage(img, (width - width)/2, imgY, width, imgH); 
            ctx.globalAlpha = 1;
        }
    }

    ctx.restore();

    while (encoder.encodeQueueSize > 30) {
      await new Promise(r => setTimeout(r, 1)); 
    }

    const frame = new VideoFrame(canvas, { timestamp: Math.round((f * 1e6) / fps) });
    encoder.encode(frame);
    frame.close();

    if (f % 15 === 0) {
      onProgress((f / totalFrames) * 0.99); 
      await new Promise(r => setTimeout(r, 0));
    }
  }

  await encoder.flush();
  muxer.finalize();
  onProgress(1.0);
  resolve(new Blob([muxer.target.buffer], { type: 'video/mp4' }));

  } catch(e) {
    reject(e);
  }
  });
}

function buildRoundedPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrapText(context, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let testStr = text;
  let linesEst = Math.ceil(context.measureText(testStr).width / maxWidth);
  let startY = y - ((linesEst - 1) * lineHeight) / 2;

  for(let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = context.measureText(testLine);
    const testWidth = metrics.width;
    
    if (testWidth > maxWidth && n > 0) {
      context.fillText(line, x, startY);
      line = words[n] + ' ';
      startY += lineHeight;
    } else {
      line = testLine;
    }
  }
  context.fillText(line, x, startY);
}
