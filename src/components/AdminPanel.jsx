import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuizStore } from '../store/quizStore';
import { PlusCircle, Trash2, Save, ArrowLeft, Image as ImageIcon } from 'lucide-react';
import Cropper from 'react-easy-crop';
import { getCroppedImg } from '../utils/cropImage';

const emptyOption = { text: '' };

const defaultQuiz = {
  question: '',
  options: [{ ...emptyOption }, { ...emptyOption }, { ...emptyOption }, { ...emptyOption }],
  correctOptionIndex: 0,
  explanation: '',
  cta: 'সাবস্ক্রাইব করে সাথে থাকুন (Subscribe for more)',
  image: null,
  config: {
    readDelay: 30,
    theme: 'islamic-gold',
    animation: 'slideUp',
    boxStyle: '3d'
  }
};

export default function AdminPanel() {
  const { id } = useParams();
  const { quizzes, addQuiz, updateQuiz } = useQuizStore();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState(defaultQuiz);
  const [smartPasteText, setSmartPasteText] = useState('');
  
  // Cropper State
  const [isCropping, setIsCropping] = useState(false);
  const [cropData, setCropData] = useState({ imageSrc: null, crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null });

  // Load quiz if editing
  useEffect(() => {
    if (id) {
      const existing = quizzes.find((q) => q.id === id);
      if (existing) {
        setQuiz({
          ...existing,
          config: { ...defaultQuiz.config, ...(existing.config || {}) }
        });
      }
    } else {
      setQuiz(defaultQuiz);
    }
  }, [id, quizzes]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCropData({ ...cropData, imageSrc: url, zoom: 1, crop: { x: 0, y: 0 } });
      setIsCropping(true);
      // Reset the file input so the same file could be loaded again
      e.target.value = null;
    }
  };

  const updateOption = (index, text) => {
    const newOptions = [...quiz.options];
    newOptions[index].text = text;
    setQuiz({ ...quiz, options: newOptions });
  };

  const handleSmartPaste = () => {
    if (!smartPasteText) return;
    
    const lines = smartPasteText.split('\n').map(l => l.trim()).filter(Boolean);
    let newQuiz = { ...quiz };
    
    let currentSection = null;
    let optionsFound = 0;
    
    // Auto-parse formatting (A., B., Option 1:, etc)
    lines.forEach(line => {
      const lowerLine = line.toLowerCase();
      
      // Check for tags
      if (lowerLine.startsWith('question:') || lowerLine.startsWith('q:')) {
        newQuiz.question = line.replace(/^(question|q):\s*/i, '');
        currentSection = 'question';
      } else if (lowerLine.startsWith('answer:') || lowerLine.startsWith('ans:')) {
        const ans = line.replace(/^(answer|ans):\s*/i, '').toUpperCase();
        if (['A', 'B', 'C', 'D'].includes(ans)) {
          newQuiz.correctOptionIndex = ['A', 'B', 'C', 'D'].indexOf(ans);
        } else if (['1', '2', '3', '4'].includes(ans)) {
          newQuiz.correctOptionIndex = parseInt(ans) - 1;
        }
        currentSection = 'answer';
      } else if (lowerLine.startsWith('explanation:') || lowerLine.startsWith('exp:')) {
        newQuiz.explanation = line.replace(/^(explanation|exp):\s*/i, '');
        currentSection = 'explanation';
      } else if (lowerLine.startsWith('cta:')) {
        newQuiz.cta = line.replace(/^cta:\s*/i, '');
        currentSection = 'cta';
      } 
      // check for options
      else if (/^[A-D]\.\s*/i.test(line) || /^[1-4]\.\s*/i.test(line) || /^Option [1-4]:\s*/i.test(line)) {
        const optText = line.replace(/^[A-D1-4]\.\s*/i, '').replace(/^Option [1-4]:\s*/i, '');
        if (optionsFound < 4) {
          // Normalize formatting to "Option 1: text" inside the store/UI if wanted, but UI displays A,B,C,D.
          // Wait, the prompt says 'transform options like "A. text" -> "Option 1: text"'. We store that transformed!
          newQuiz.options[optionsFound].text = optText;
          optionsFound++;
        }
      } else {
        // Fallback for multi-line or untagged sequentially
        if (currentSection === 'question') {
          newQuiz.question += ' ' + line;
        } else if (currentSection === 'explanation') {
          newQuiz.explanation += ' ' + line;
        } else if (currentSection === 'cta') {
          newQuiz.cta += ' ' + line;
        }
      }
    });

    setQuiz(newQuiz);
    setSmartPasteText(''); // clear out
  };

  const handleSave = () => {
    if (!quiz.question || quiz.options.some(o => !o.text)) {
      alert('Please fill out the question and all options.');
      return;
    }
    
    if (id) {
      updateQuiz(id, quiz);
    } else {
      addQuiz(quiz);
    }
    navigate('/');
  };

  return (
    <div className="admin-container">
      <div className="admin-header glass-panel mb-4">
        <div className="flex gap-4 items-center">
          <button className="btn btn-secondary btn-icon" onClick={() => navigate('/')}><ArrowLeft size={18} /></button>
          <h1>{id ? 'Edit Quiz' : 'Create Animated Quiz'}</h1>
        </div>
        <button className="btn btn-primary" onClick={handleSave}>
          <Save size={18} /> {id ? 'Save Changes' : 'Save & Publish'}
        </button>
      </div>

      <div className="admin-content">
        <div className="form-group glass-panel">
          <label className="flex justify-between items-center">
            <span>Smart Script Paste (Auto-Parse)</span>
            <button className="btn btn-secondary btn-sm" onClick={handleSmartPaste}>Auto Fill</button>
          </label>
          <textarea 
            value={smartPasteText} 
            onChange={e => setSmartPasteText(e.target.value)}
            placeholder={"Paste raw format:\nQuestion: What is 1+1?\nA. 1\nB. 2\nC. 3\nD. 4\nAnswer: B\nExplanation: Because math.\nCTA: Subscribe!"}
            className="input-textarea"
            rows={4}
          />
        </div>

        <div className="form-group glass-panel">
          <label>Question Text</label>
          <textarea 
            value={quiz.question} 
            onChange={e => setQuiz({...quiz, question: e.target.value})}
            placeholder="e.g. Write the question here..."
            className="input-textarea"
            rows={3}
          />
        </div>

        <div className="form-group glass-panel">
          <label>Options (Select the correct one)</label>
          <div className="options-list">
            {quiz.options.map((opt, i) => (
              <div key={i} className={`option-input-wrapper ${quiz.correctOptionIndex === i ? 'correct-selected' : ''}`}>
                <input 
                  type="radio" 
                  name="correctOption" 
                  checked={quiz.correctOptionIndex === i}
                  onChange={() => setQuiz({...quiz, correctOptionIndex: i})}
                  title="Mark as correct answer"
                />
                <input 
                  type="text" 
                  value={opt.text}
                  onChange={e => updateOption(i, e.target.value)}
                  placeholder={`Option ${['A', 'B', 'C', 'D'][i]}`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="form-group glass-panel">
          <label>Explanation Text (Shown after Reveal)</label>
          <textarea 
            value={quiz.explanation} 
            onChange={e => setQuiz({...quiz, explanation: e.target.value})}
            placeholder="e.g. This is because..."
            className="input-textarea"
            rows={2}
          />
        </div>

        <div className="form-group glass-panel">
          <label>Call to Action (CTA Text)</label>
          <input 
            type="text" 
            value={quiz.cta} 
            onChange={e => setQuiz({...quiz, cta: e.target.value})}
            placeholder="e.g. Subscribe for more!"
          />
        </div>

        <div className="form-group glass-panel image-uploader">
          <label>Image Upload & Positioning (Cropper)</label>
          <div className="upload-box">
            {quiz.image ? (
              <div className="image-preview" style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img 
                   src={quiz.image} 
                   alt="Preview"
                   style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
                <button className="btn btn-danger btn-sm" style={{ position: 'absolute', zIndex: 10, bottom: 20, right: 20 }} onClick={() => setQuiz({...quiz, image: null})}>
                  <Trash2 size={14}/> Remove
                </button>
              </div>
            ) : (
              <label className="upload-label">
                <ImageIcon size={32} />
                <span>Click to browse or drag an image here</span>
                <input type="file" accept="image/*" onChange={handleImageUpload} hidden />
              </label>
            )}
          </div>
        </div>

        <div className="form-group glass-panel">
          <label>Configuration</label>
          <div className="config-grid">
            <div className="config-item">
              <span>Wait Time before Answer (Sec)</span>
              <input type="number" min="1" max="60" value={quiz.config.readDelay} onChange={e => setQuiz({...quiz, config: {...quiz.config, readDelay: Number(e.target.value)}})} />
            </div>
            <div className="config-item">
              <span>Theme Style</span>
              <select value={quiz.config.theme} onChange={e => setQuiz({...quiz, config: {...quiz.config, theme: e.target.value}})}>
                <option value="islamic-gold">Islamic Gold (Star Pattern)</option>
                <option value="islamic-emerald">Islamic Emerald (Star Pattern)</option>
                <option value="islamic-night">Islamic Night (Star Pattern)</option>
                <option value="default">Default Dark (Plain)</option>
                <option value="vibrant">Vibrant Purple (Plain)</option>
              </select>
            </div>
            <div className="config-item">
              <span>Option Box Style</span>
              <select value={quiz.config.boxStyle || 'solid'} onChange={e => setQuiz({...quiz, config: {...quiz.config, boxStyle: e.target.value}})}>
                <option value="solid">Flat Solid Box</option>
                <option value="crystal">Crystal / Water Glass</option>
                <option value="3d">3D Pop Button</option>
                <option value="neon">Neon Glowing Edge</option>
              </select>
            </div>
            <div className="config-item">
              <span>Animation Type</span>
              <select value={quiz.config.animation || 'slideUp'} onChange={e => setQuiz({...quiz, config: {...quiz.config, animation: e.target.value}})}>
                <option value="slideUp">Smooth Slide Up</option>
                <option value="zoomIn">Pop Zoom In</option>
                <option value="fadeIn">Gentle Fade In</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {isCropping && (
        <div className="crop-modal" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '15px', color: 'white', textAlign: 'center', background: '#000' }}>
            <h2>Crop Image for Quiz</h2>
            <p>Drag to pan and scroll to zoom. The cropped area identically matches the video player bounds.</p>
          </div>
          <div style={{ position: 'relative', flex: 1 }}>
            <Cropper
              image={cropData.imageSrc}
              crop={cropData.crop}
              zoom={cropData.zoom}
              aspect={400 / 250} /* 400x250 visual match for QuizPlayer container */
              onCropChange={(crop) => setCropData(d => ({ ...d, crop }))}
              onZoomChange={(zoom) => setCropData(d => ({ ...d, zoom }))}
              onCropComplete={(croppedArea, croppedAreaPixels) => setCropData(d => ({ ...d, croppedAreaPixels }))}
              showGrid={false}
            />
          </div>
          <div style={{ padding: '20px', background: '#1e293b', display: 'flex', justifyContent: 'center', gap: '20px' }}>
            <button className="btn btn-secondary" onClick={() => setIsCropping(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={async () => {
              try {
                const croppedUrl = await getCroppedImg(cropData.imageSrc, cropData.croppedAreaPixels);
                setQuiz({ ...quiz, image: croppedUrl });
                setIsCropping(false);
              } catch(e) {
                alert("Cropping failed");
              }
            }}><Save size={16}/> Save Perfect Crop</button>
          </div>
        </div>
      )}
    </div>
  );
}
