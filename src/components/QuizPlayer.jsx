import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuizStore } from '../store/quizStore';
import { Check, RotateCcw, Download, ArrowLeft, Loader2 } from 'lucide-react';
import { exportQuizProgrammatically } from '../utils/exporter';
import { buildAudioTimeline } from '../utils/timelineEngine';

export default function QuizPlayer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { quizzes } = useQuizStore();
  const quiz = quizzes.find(q => q.id === id);

  const [t, setT] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelineReady, setTimelineReady] = useState(false);
  const [timelineData, setTimelineData] = useState(null);
  
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');

  const audioCtxRef = useRef(null);
  const sourceNodesRef = useRef([]);
  const rAFRef = useRef(null);
  const startTimeRef = useRef(0);

  // Initialize timeline on mount
  useEffect(() => {
    if (quiz) {
      buildAudioTimeline(quiz).then(data => {
        setTimelineData(data);
        setTimelineReady(true);
      });
    }
  }, [quiz]);

  const stopPlayback = () => {
    if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
    sourceNodesRef.current.forEach(s => {
      try { s.stop(); } catch(e) {}
    });
    sourceNodesRef.current = [];
    if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
    }
    setIsPlaying(false);
    setT(0);
  };

  const startPlayback = async () => {
    stopPlayback();
    if (!timelineData) return;
    
    setIsPlaying(true);
    setT(0);
    
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;
    
    // Schedule all audio
    timelineData.segments.forEach(seg => {
      if (seg.audioBuffer) {
        const source = ctx.createBufferSource();
        source.buffer = seg.audioBuffer;
        source.connect(ctx.destination);
        source.start(ctx.currentTime + seg.start);
        sourceNodesRef.current.push(source);
      }
    });
    
    startTimeRef.current = ctx.currentTime;
    
    const updateFrame = () => {
      if (!audioCtxRef.current) return;
      const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
      setT(elapsed);
      
      if (elapsed < timelineData.totalDuration) {
        rAFRef.current = requestAnimationFrame(updateFrame);
      } else {
        setIsPlaying(false);
      }
    };
    rAFRef.current = requestAnimationFrame(updateFrame);
  };

  useEffect(() => {
    return () => stopPlayback();
  }, []);

  if (!quiz) {
    return <div className="p-8 text-center"><p>Quiz not found</p></div>;
  }

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportStatusText('Preparing Audio Timeline...');
    
    try {
      // Export handles its own timeline, but we let it run
      const blob = await exportQuizProgrammatically(quiz, (prog) => {
        setExportProgress(prog);
        if (prog < 0.1) setExportStatusText('Fetching AI Voice...');
        else if (prog < 0.99) setExportStatusText('Rendering Video Frames...');
        else setExportStatusText('Muxing Final MP4...');
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quiz-reels-${quiz.id.slice(0,6)}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed! See console for details.");
    } finally {
      setIsExporting(false);
      setExportProgress(0);
      setExportStatusText('');
    }
  };

  const animType = quiz.config.animation || 'slideUp';
  const boxStyle = quiz.config.boxStyle || 'solid';

  function getAnimProps(currT, appearT, pDuration = 0.8) {
    if (currT < appearT) return { op: 0, off: 0, scale: 1 };
    if (currT >= appearT + pDuration) return { op: 1, off: 0, scale: 1 };
    const p = (currT - appearT) / pDuration;
    const pOut = 1 - Math.pow(1 - p, 4); 
    const op = pOut;
    const off = animType === 'slideUp' ? 40 * (1 - pOut) : 0;
    const scale = animType === 'zoomIn' ? 0.85 + (0.15 * pOut) : 1;
    return { op, off, scale };
  }

  function getSegmentTime(typeKey) {
    if (!timelineData) return 9999;
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

  // Question Anim
  const { op: qOpacity, off: qOffset, scale: qScale } = getAnimProps(t, qAppT, 1.0);
  
  // Timer Anim 
  const { op: tOp, scale: tSc } = getAnimProps(t, tStartT, 0.5);
  let currentNum = '';
  for (let i = 0; i < tTicks.length; i++) {
    if (tTicks[i] <= t) currentNum = ['5','4','3','2','1'][i];
  }

  return (
    <div className="player-wrapper">
      <div className="player-controls glass-panel">
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          <ArrowLeft size={16} /> Back
        </button>
        <button className="btn btn-primary" onClick={startPlayback} disabled={!timelineReady || isPlaying || isExporting}>
          {isPlaying ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} 
          {timelineReady ? (isPlaying ? 'Playing...' : 'Live Preview') : 'Loading AI Voice...'}
        </button>
        <button className="btn btn-danger" onClick={handleExport} disabled={isExporting || !timelineReady}>
          {isExporting ? `Exporting: ${Math.round(exportProgress * 100)}%` : <><Download size={16} /> Generate MP4</>}
        </button>
      </div>
      
      {isExporting && exportStatusText && (
         <div style={{ textAlign: 'center', marginBottom: 12, color: '#10b981', fontWeight: 'bold' }}>
           {exportStatusText}
         </div>
      )}

      {/* 
        This is a visual React equivalent of the canvas renderer. 
        It uses inline styles driven by JS requestAnimationFrame instead of CSS.
      */}
      <div className={`reel-container theme-${quiz.config.theme}`} style={{ position: 'relative', overflow: 'hidden' }}>
        
        {/* Background Pattern */}
        <div className="reel-bg-pattern" style={{ opacity: 1 }}></div>

        <div className="reel-content" style={{ zIndex: 10 }}>
          <div className={`reel-question`} style={{ 
            opacity: qOpacity, 
            transform: `translateY(${qOffset}px) scale(${qScale})`,
            transition: 'none' // Controlled strictly by JS
          }}>
            <h2 style={{ lineHeight: '1.4' }}>{quiz.question}</h2>
          </div>

          <div className="reel-options" style={{ marginTop: '2rem' }}>
            {quiz.options.map((opt, i) => {
              const optAppearT = oAppTs[i];
              let { op: opOpacity, off: opOffset, scale: opScale } = getAnimProps(t, optAppearT, 0.8);
              
              const isCorrect = i === quiz.correctOptionIndex;
              let isRevealed = t >= aAppT;
              let stateClass = '';
              
              if (isRevealed) {
                if (isCorrect) {
                  stateClass = 'state-reveal-correct';
                  const tReveal = Math.min(1.0, (t - aAppT) / 0.5);
                  opScale = opScale * (1.0 + Math.sin(tReveal * Math.PI) * 0.05);
                } else {
                  opOpacity *= 0.4;
                }
              }

              return (
                <div key={i} className={`reel-option box-style-${boxStyle} ${stateClass}`} 
                     style={{ 
                       opacity: opOpacity, 
                       transform: `translateY(${opOffset}px) scale(${opScale})`,
                       transition: 'none',
                       marginLeft: 0,
                       marginRight: 0,
                       width: '100%'
                     }}>
                  <span>Option {i+1}: {opt.text}</span>
                  {isRevealed && isCorrect && (
                    <Check size={24} className="text-white" style={{ position: 'absolute', right: '15px' }} />
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Circular Timer UI */}
          {tOp > 0 && t < aAppT && (
            <div style={{
              position: 'absolute', top: '420px', left: '50%', transform: `translate(-50%, -50%) scale(${tSc})`,
              width: '80px', height: '80px', borderRadius: '50%',
              border: '4px solid', borderColor: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--surface-color)', opacity: tOp,
              color: 'var(--text-color)', fontSize: currentNum ? '32px' : '14px', fontWeight: 'bold'
            }}>
               {currentNum || "Ready"}
            </div>
          )}

          {/* Explanation Banner UI Alignment Fix */}
          {quiz.explanation && t >= xAppT && (() => {
             const { op: xOp, off: xOff } = getAnimProps(t, xAppT, 1.0);
             return (
               <div style={{
                 position: 'absolute', top: `max(460px, calc(460px + ${xOff}px))`, left: '20px', right: '20px',
                 height: '140px', overflow: 'hidden', // bounded box
                 background: 'rgba(0,0,0,0.8)', padding: '15px', borderRadius: '12px',
                 opacity: xOp, color: 'white'
               }}>
                 <div style={{ color: '#10b981', fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>Explanation:</div>
                 <div style={{ fontSize: '15px', lineHeight: '1.4' }}>{quiz.explanation}</div>
               </div>
             );
          })()}

          {/* REDESIGNED CTA UI (Animated Button + Click) */}
          {quiz.cta && t >= cAppT && (() => {
             const isSubscribe = /subscribe|সাবস্ক্রাইব/i.test(quiz.cta);
             const btnText = isSubscribe ? "SUBSCRIBE" : "FOLLOW";
             const btnColor = isSubscribe ? "#ef4444" : "#3b82f6";

             const { op: cOp, off: cOff } = getAnimProps(t, cAppT, 0.8);
             
             // Tap Logic
             const clickTime = cAppT + 1.2;
             let scale = 1.0;
             if (t >= clickTime && t < clickTime + 0.4) {
               const pressP = Math.max(0, 1 - Math.abs(t - clickTime) / 0.1);
               scale = 1.0 - (pressP * 0.1); 
             }

             // Hand Cursor Logic
             let handY = 80;
             let ripLife = 0;
             if (t >= cAppT + 0.5) {
               const slideIn = Math.min(1.0, (t - (cAppT + 0.5)) / 0.4);
               const slideCurve = 1 - Math.pow(1 - slideIn, 3);
               handY = 80 - (slideCurve * 60);
             }
             if (t >= clickTime) {
               ripLife = Math.min(1.0, (t - clickTime) / 0.5);
             }

             return (
               <div style={{
                 position: 'absolute', bottom: '60px', left: '50%', 
                 transform: `translateX(-50%) translateY(${cOff}px)`,
                 opacity: cOp, zIndex: 50
               }}>
                 <div style={{
                   background: btnColor, width: '180px', height: '50px', borderRadius: '25px',
                   display: 'flex', alignItems: 'center', justifyContent: 'center',
                   color: 'white', fontWeight: 'bold', fontSize: '18px',
                   transform: `scale(${scale})`, boxShadow: `0 0 15px ${btnColor}`,
                   position: 'relative'
                 }}>
                   {btnText}

                   {/* Animated Hand Pointer */}
                   {t >= cAppT + 0.5 && (
                     <div style={{
                       position: 'absolute', top: `${handY}px`, left: '110px',
                       fontSize: '34px', pointerEvents: 'none'
                     }}>
                       👆
                       {/* Tap Ripple */}
                       {ripLife > 0 && ripLife < 1 && (
                         <div style={{
                           position: 'absolute', top: '2px', left: '16px',
                           width: `${ripLife * 60}px`, height: `${ripLife * 60}px`,
                           border: '4px solid rgba(255,255,255,1)',
                           borderRadius: '50%', opacity: 1 - ripLife,
                           transform: 'translate(-50%, -50%)'
                         }} />
                       )}
                     </div>
                   )}
                 </div>
               </div>
             );
          })()}

        </div>

        {/* Pre-cropped overlay */}
        {quiz.image && t < aAppT && (() => {
            const { op: imgOp } = getAnimProps(t, 2.0, 1.0); 
            const fadeOut = Math.max(0, 1 - (t - aAppT) * 2);
            const finalOp = imgOp * fadeOut;
            if (finalOp <= 0) return null;
            return (
              <div style={{ 
                position: 'absolute', bottom: '0', left: 0, width: '100%', height: '160px', zIndex: 5,
                opacity: finalOp 
              }}>
                <img src={quiz.image} alt="Context" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            );
        })()}

      </div>
    </div>
  );
}
